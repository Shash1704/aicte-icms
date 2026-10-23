import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { UPLOAD_DIR } from './db.js';
import { makeAuth, requireRole, signToken, verifyPassword, publicUser, scopeSql } from './auth.js';
import { BUREAUS, REGIONS, CATEGORIES, STATUSES, PRIORITIES, SOURCES, COMPLAINANT_TYPES, DISPOSAL_TYPES, ACTION_TYPES, ROLES } from './domain.js';
import { caseFilter, CASE_LIST_SELECT, toCsv } from './filters.js';
import { canAct, canView, HttpError } from './cases.js';
import { slaInfo } from './engine.js';

const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => cb(ALLOWED_MIME.has(file.mimetype) ? null : new HttpError(400, `File type not allowed: ${file.originalname}`), ALLOWED_MIME.has(file.mimetype)),
});

export function buildRouter({ db, engine, cases, audit }) {
  const r = express.Router();
  const auth = makeAuth(db);

  // ---------- auth ----------
  const attempts = new Map(); // simple login throttling per username
  r.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const key = String(username || '').toLowerCase();
    const a = attempts.get(key) || { n: 0, until: 0 };
    if (a.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
    const u = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(key);
    if (!u || !verifyPassword(String(password || ''), u.password_hash)) {
      a.n++; if (a.n >= 5) { a.until = Date.now() + 60_000; a.n = 0; }
      attempts.set(key, a);
      audit(null, 'auth.failed', 'user', key, null, req.ip);
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    attempts.delete(key);
    audit(u, 'auth.login', 'user', u.username, null, req.ip);
    res.json({ token: signToken(u.id), user: publicUser(u) });
  });

  // Demo accounts are listed on the login screen (disable with ICMS_HIDE_DEMO=1).
  r.get('/auth/demo-accounts', (_req, res) => {
    if (process.env.ICMS_HIDE_DEMO === '1') return res.json([]);
    res.json(db.prepare(`SELECT username, name, designation, role, bureau_code, region_code FROM users
      WHERE username IN ('chairman','rb.head','rb.officer1','pgrc.head','pgrc.officer1','arc.officer1','ro.sro','ro.wro') ORDER BY id`).all());
  });

  r.use(auth);
  r.get('/auth/me', (req, res) => res.json(req.user));

  // ---------- reference data ----------
  r.get('/meta', (req, res) => {
    res.json({
      bureaus: BUREAUS, regions: REGIONS, categories: CATEGORIES, statuses: STATUSES, priorities: PRIORITIES, sources: SOURCES,
      complainantTypes: COMPLAINANT_TYPES, disposalTypes: DISPOSAL_TYPES, actionTypes: ACTION_TYPES, roles: ROLES,
      users: db.prepare('SELECT id, name, designation, role, bureau_code, region_code FROM users WHERE active = 1 ORDER BY bureau_code, role, name').all(),
    });
  });

  // ---------- global search (header omnibox) ----------
  r.get('/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ cases: [], institutions: [] });
    const like = `%${q}%`;
    const scope = scopeSql(req.user, 'c');
    const casesFound = db.prepare(`SELECT c.id, c.case_no, c.subject, c.status, c.bureau_code, i.name AS institution_name FROM cases c
      LEFT JOIN institutions i ON i.id = c.institution_id WHERE ${scope.sql} AND (c.case_no LIKE ? OR c.external_ref LIKE ?) ORDER BY c.received_on DESC LIMIT 6`).all(...scope.params, like, like);
    const fuzzy = engine.matcher.match({ name: q, aicteId: /\d{4,}/.test(q) ? q : undefined }, 6).filter((m) => m.score >= 0.35);
    const direct = db.prepare('SELECT id, name, aicte_id, city, state FROM institutions WHERE name LIKE ? OR aicte_id LIKE ? OR city LIKE ? LIMIT 6').all(like, like, like);
    const seen = new Set();
    const institutions = [...direct.map((i) => ({ ...i, score: 1 })), ...fuzzy.map((m) => ({ id: m.institution.id, name: m.institution.name, aicte_id: m.institution.aicte_id, city: m.institution.city, state: m.institution.state, score: Number(m.score.toFixed(2)), fuzzy: true }))]
      .filter((i) => (seen.has(i.id) ? false : seen.add(i.id))).slice(0, 6);
    res.json({ cases: casesFound, institutions });
  });

  // ---------- cases ----------
  const SORTS = { received_on: 'c.received_on', case_no: 'c.case_no', status: 'c.status', bureau: 'c.bureau_code', days_left: 'days_left', last_action_on: 'c.last_action_on', institution: 'i.name', priority: "CASE c.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END" };

  r.get('/cases', (req, res) => {
    const f = caseFilter(req.query, req.user, engine);
    const sort = SORTS[req.query.sort] || 'c.received_on';
    const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
    const base = `${CASE_LIST_SELECT} WHERE ${f.sql}`;
    if (req.query.format === 'csv') {
      const rows = db.prepare(`${base} ORDER BY ${sort} ${dir}`).all(...f.params);
      audit(req.user, 'export.cases', 'cases', null, { count: rows.length, query: req.query });
      const cols = [['case_no', 'Case ID'], ['received_on', 'Date of receipt'], ['institution_name', 'Institution'], ['aicte_id', 'AICTE Permanent ID'], ['region_code', 'Region'],
        ['category', 'Category'], ['subject', 'Subject'], ['status', 'Status'], ['bureau_code', 'Bureau/Cell'], ['origin_bureau', 'Received by'], ['officer_name', 'Assigned officer'],
        ['last_action', 'Last action'], ['last_action_on', 'Last action on'], ['next_action', 'Next action'], ['next_action_due', 'Next action due'], ['expected_disposal', 'Expected disposal'],
        ['days_left', 'Days to SLA (−=overdue)'], ['disposed_on', 'Disposed on'], ['priority', 'Priority']].map(([key, label]) => ({ key, label }));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="aicte-cases-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(toCsv(cols, rows));
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(200, Math.max(5, Number(req.query.size) || 25));
    const total = db.prepare(`SELECT COUNT(*) n FROM cases c LEFT JOIN institutions i ON i.id = c.institution_id WHERE ${f.sql}`).get(...f.params).n;
    const rows = db.prepare(`${base} ORDER BY ${sort} ${dir}, c.id DESC LIMIT ? OFFSET ?`).all(...f.params, size, (page - 1) * size);
    const overlapInst = new Set(engine.overlapGroups().map((g) => g.institution_id));
    for (const row of rows) {
      row.overlap = overlapInst.has(row.institution_id);
      row.sla = slaInfo(row).state;
    }
    res.json({ total, page, size, rows });
  });

  r.get('/cases/:id', (req, res) => {
    const c = db.prepare(`${CASE_LIST_SELECT} WHERE c.id = ?`).get(Number(req.params.id));
    if (!c) throw new HttpError(404, 'Case not found');
    const full = db.prepare('SELECT * FROM cases WHERE id = ?').get(c.id);
    if (!canView(req.user, full)) throw new HttpError(403, 'This case is outside your region');
    const institution = full.institution_id ? db.prepare('SELECT * FROM institutions WHERE id = ?').get(full.institution_id) : null;
    const actions = db.prepare(`SELECT a.*, u.name AS actor_name, u.designation AS actor_designation FROM case_actions a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.case_id = ? ORDER BY a.at, a.id`).all(c.id);
    const docs = db.prepare(`SELECT d.id, d.action_id, d.filename, d.mime, d.size, d.uploaded_at, u.name AS uploaded_by FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.case_id = ? ORDER BY d.uploaded_at`).all(c.id);
    const links = db.prepare(`SELECT l.id, l.link_type, l.note, l.created_at, u.name AS created_by,
        o.id AS other_id, o.case_no AS other_case_no, o.bureau_code AS other_bureau, o.status AS other_status, o.subject AS other_subject
      FROM case_links l JOIN cases o ON o.id = CASE WHEN l.case_a = ? THEN l.case_b ELSE l.case_a END LEFT JOIN users u ON u.id = l.created_by
      WHERE l.case_a = ? OR l.case_b = ?`).all(c.id, c.id, c.id);
    const overlap = full.institution_id ? engine.overlapForInstitution(full.institution_id) : null;
    const instCases = full.institution_id ? db.prepare(`SELECT c.id, c.case_no, c.bureau_code, c.status, c.category, c.subject, c.received_on, u.name AS officer_name
      FROM cases c LEFT JOIN users u ON u.id = c.officer_id WHERE c.institution_id = ? AND c.id != ? ORDER BY c.received_on DESC LIMIT 30`).all(full.institution_id, c.id) : [];
    const duplicates = engine.duplicatePairs({ caseId: c.id }).map((p) => ({ ...p, other: p.a.id === c.id ? p.b : p.a }));
    const candidates = !full.institution_id ? engine.matcher.match({ name: full.institution_name_raw, aicteId: full.aicte_id_raw, city: full.institution_city_raw }) : [];
    res.json({
      ...full, ...c,
      sla: slaInfo(full),
      institution, actions, documents: docs, links, overlap, institutionCases: instCases, duplicates,
      similar: engine.similarCases(c.id),
      candidates: candidates.map((m) => ({ ...m, score: Number(m.score.toFixed(2)) })),
      permissions: {
        canAct: canAct(req.user, full),
        canAssign: req.user.role === 'admin' || (req.user.role === 'head' && req.user.bureau_code === full.bureau_code),
        canDirect: full.status === 'Escalated' && (req.user.role === 'admin' || (req.user.role === 'head' && req.user.bureau_code === full.bureau_code)),
      },
    });
  });

  r.post('/intake/analyze', (req, res) => res.json(cases.analyzeIntake(req.body || {})));
  r.get('/intake/match', (req, res) => {
    const m = engine.matcher.match({ name: req.query.name, aicteId: req.query.aicte_id, city: req.query.city, state: req.query.state }, 6);
    res.json(m.map((x) => ({ ...x, score: Number(x.score.toFixed(2)) })));
  });

  r.post('/cases', (req, res) => {
    const out = cases.create(req.body || {}, req.user);
    res.status(201).json(out);
  });

  r.post('/cases/:id/actions', upload.array('files', 5), (req, res) => {
    const c = cases.act(Number(req.params.id), req.body || {}, req.user, req.files || []);
    res.json(c);
  });
  r.post('/cases/:id/assign', (req, res) => res.json(cases.assign(Number(req.params.id), Number(req.body?.officer_id), req.user)));
  r.post('/cases/:id/links', (req, res) => {
    const other = req.body?.other_id ? Number(req.body.other_id) : db.prepare('SELECT id FROM cases WHERE case_no = ?').get(String(req.body?.other_case_no || '').trim())?.id;
    if (!other) throw new HttpError(400, 'Related case not found');
    cases.link(Number(req.params.id), other, req.body?.link_type || 'related', req.body?.note, req.user);
    res.json({ ok: true });
  });
  r.delete('/links/:id', (req, res) => { cases.unlink(Number(req.params.id), req.user); res.json({ ok: true }); });
  r.post('/cases/:id/resolve-institution', (req, res) => res.json(cases.resolveInstitution(Number(req.params.id), req.body?.institution_id, req.user)));

  r.get('/documents/:id', (req, res) => {
    const d = db.prepare('SELECT d.*, c.region_code, c.bureau_code FROM documents d JOIN cases c ON c.id = d.case_id WHERE d.id = ?').get(Number(req.params.id));
    if (!d) throw new HttpError(404, 'Document not found');
    if (!canView(req.user, d)) throw new HttpError(403, 'Not permitted');
    const file = path.join(UPLOAD_DIR, path.basename(d.stored_name));
    if (!fs.existsSync(file)) throw new HttpError(404, 'File missing on server');
    audit(req.user, 'document.download', 'document', String(d.id), { case_id: d.case_id });
    res.setHeader('Content-Type', d.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${d.filename.replace(/"/g, '')}"`);
    res.sendFile(file);
  });

  // ---------- institutions ----------
  r.get('/institutions', (req, res) => {
    const where = ['1=1'];
    const params = [];
    if (req.user.role === 'regional') { where.push('i.region_code = ?'); params.push(req.user.region_code); }
    if (req.query.region) { where.push('i.region_code = ?'); params.push(req.query.region); }
    if (req.query.state) { where.push('i.state = ?'); params.push(req.query.state); }
    if (req.query.type) { where.push('i.type = ?'); params.push(req.query.type); }
    if (req.query.q) { const q = `%${req.query.q}%`; where.push('(i.name LIKE ? OR i.aicte_id LIKE ? OR i.city LIKE ? OR i.aliases LIKE ?)'); params.push(q, q, q, q); }
    const overlapIds = new Set(engine.overlapGroups().map((g) => g.institution_id));
    if (req.query.overlap === '1') where.push(overlapIds.size ? `i.id IN (${[...overlapIds].join(',')})` : '0');
    const sort = { name: 'i.name ASC', total: 'total DESC', active: 'active DESC', breached: 'breached DESC', risk: 'risk DESC' }[req.query.sort] || 'risk DESC';
    const rows = db.prepare(`SELECT i.id, i.aicte_id, i.name, i.city, i.state, i.region_code, i.type, i.ownership, i.approval_status,
        COUNT(c.id) AS total,
        SUM(c.status != 'Disposed') AS active,
        SUM(c.status != 'Disposed' AND c.expected_disposal < date('now')) AS breached,
        COUNT(DISTINCT CASE WHEN c.status != 'Disposed' THEN c.bureau_code END) AS active_bureaus,
        GROUP_CONCAT(DISTINCT CASE WHEN c.status != 'Disposed' THEN c.bureau_code END) AS bureaus,
        MAX(c.received_on) AS last_received,
        (COUNT(c.id) * 1.0 + SUM(c.status != 'Disposed') * 3 + SUM(c.status != 'Disposed' AND c.expected_disposal < date('now')) * 4
          + SUM(c.category IN ('RAGGING','UNAPPROVED','HARASSMENT')) * 3 + SUM(c.received_on >= date('now','-90 days')) * 2) AS risk
      FROM institutions i LEFT JOIN cases c ON c.institution_id = i.id
      WHERE ${where.join(' AND ')} GROUP BY i.id ORDER BY ${sort}, i.name LIMIT ? OFFSET ?`).all(...params, Math.min(500, Number(req.query.size) || 50), ((Number(req.query.page) || 1) - 1) * (Number(req.query.size) || 50));
    const total = db.prepare(`SELECT COUNT(*) n FROM institutions i WHERE ${where.join(' AND ')}`).get(...params).n;
    for (const row of rows) row.overlap = overlapIds.has(row.id);
    res.json({ total, rows });
  });

  r.get('/institutions/:id', (req, res) => {
    const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(Number(req.params.id));
    if (!inst) throw new HttpError(404, 'Institution not found');
    if (req.user.role === 'regional' && inst.region_code !== req.user.region_code) throw new HttpError(403, 'Outside your region');
    inst.aliases = JSON.parse(inst.aliases || '[]');
    const caseRows = db.prepare(`${CASE_LIST_SELECT} WHERE c.institution_id = ? ORDER BY c.received_on DESC`).all(inst.id);
    for (const row of caseRows) row.sla = slaInfo(row).state;
    const actions = db.prepare(`SELECT a.at, a.action_type, a.bureau_code, a.to_bureau, a.remarks, c.case_no, c.id AS case_id, u.name AS actor_name
      FROM case_actions a JOIN cases c ON c.id = a.case_id LEFT JOIN users u ON u.id = a.actor_id
      WHERE c.institution_id = ? AND a.action_type NOT IN ('ASSIGNED') ORDER BY a.at DESC LIMIT 60`).all(inst.id);
    const byBureau = {};
    for (const c of caseRows) {
      byBureau[c.bureau_code] ??= { bureau: c.bureau_code, total: 0, active: 0, breached: 0 };
      byBureau[c.bureau_code].total++;
      if (c.status !== 'Disposed') byBureau[c.bureau_code].active++;
      if (c.sla === 'breached') byBureau[c.bureau_code].breached++;
    }
    const byCategory = {};
    for (const c of caseRows) byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    res.json({
      ...inst, cases: caseRows, recentActions: actions, byBureau: Object.values(byBureau), byCategory,
      overlap: engine.overlapForInstitution(inst.id),
      region: REGIONS.find((r) => r.code === inst.region_code),
    });
  });

  // ---------- overlaps, duplicates, entity resolution ----------
  r.get('/overlaps', (req, res) => {
    let groups = engine.overlapGroups({ includeDismissed: req.query.status === 'dismissed' || req.query.status === 'all' });
    if (req.user.role === 'regional') groups = groups.filter((g) => g.institution?.region_code === req.user.region_code);
    if (req.query.status && req.query.status !== 'all') groups = groups.filter((g) => g.status === req.query.status);
    if (req.query.bureau) groups = groups.filter((g) => g.bureaus.includes(req.query.bureau));
    if (req.query.region) groups = groups.filter((g) => g.institution?.region_code === req.query.region);
    if (req.query.rbpgrc === '1') groups = groups.filter((g) => g.bureaus.includes('RB') && g.bureaus.includes('PGRC'));
    res.json(groups);
  });
  r.post('/overlaps/:institutionId/review', (req, res) => res.json(cases.reviewOverlap(req.params.institutionId, req.body || {}, req.user)));

  r.get('/duplicates', (req, res) => {
    let pairs = engine.duplicatePairs();
    if (req.query.show !== 'all') pairs = pairs.filter((p) => !p.linked);
    if (req.query.cross === '1') pairs = pairs.filter((p) => p.crossBureau);
    res.json(pairs.slice(0, 200));
  });
  r.post('/duplicates/dismiss', (req, res) => { cases.dismissPair(Number(req.body?.a), Number(req.body?.b), req.user); res.json({ ok: true }); });

  r.get('/resolution-queue', (req, res) => {
    const rows = db.prepare(`SELECT id, case_no, bureau_code, status, subject, received_on, institution_name_raw, aicte_id_raw, institution_city_raw, match_method, match_score
      FROM cases WHERE institution_id IS NULL ORDER BY received_on DESC`).all();
    res.json(rows.map((c) => ({ ...c, candidates: engine.matcher.match({ name: c.institution_name_raw, aicteId: c.aicte_id_raw, city: c.institution_city_raw }, 4).map((m) => ({ ...m, score: Number(m.score.toFixed(2)) })) })));
  });

  // ---------- alerts ----------
  const alertScope = (user) => {
    if (user.role === 'admin') return { sql: '1=1', params: [] };
    if (user.role === 'regional') return { sql: '(a.region_code = ? OR a.bureau_code LIKE ?)', params: [user.region_code, '%,RO,%'] };
    return { sql: 'a.bureau_code LIKE ?', params: [`%,${user.bureau_code},%`] };
  };
  r.get('/alerts', (req, res) => {
    const s = alertScope(req.user);
    const where = [s.sql];
    const params = [...s.params];
    if (req.query.type) { where.push('a.type = ?'); params.push(req.query.type); }
    if (req.query.severity) { where.push('a.severity = ?'); params.push(req.query.severity); }
    if (req.query.state !== 'all') where.push(req.query.state === 'resolved' ? 'a.resolved_at IS NOT NULL' : 'a.resolved_at IS NULL');
    if (req.query.unread === '1') { where.push('r.alert_id IS NULL'); }
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const rows = db.prepare(`SELECT a.*, c.case_no, i.name AS institution_name, (r.alert_id IS NOT NULL) AS read
      FROM alerts a LEFT JOIN cases c ON c.id = a.case_id LEFT JOIN institutions i ON i.id = a.institution_id
      LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = ?
      WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT ?`).all(req.user.id, ...params, limit);
    const counts = db.prepare(`SELECT a.type, a.severity, COUNT(*) n, SUM(r.alert_id IS NULL) unread FROM alerts a
      LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = ? WHERE ${s.sql} AND a.resolved_at IS NULL GROUP BY a.type, a.severity`).all(req.user.id, ...s.params);
    res.json({ rows, counts });
  });
  r.get('/alerts/summary', (req, res) => {
    const s = alertScope(req.user);
    const row = db.prepare(`SELECT COUNT(*) total, SUM(r.alert_id IS NULL) unread, SUM(a.severity = 'critical' AND r.alert_id IS NULL) critical
      FROM alerts a LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = ? WHERE ${s.sql} AND a.resolved_at IS NULL`).get(req.user.id, ...s.params);
    const latest = db.prepare(`SELECT a.id, a.type, a.severity, a.title, a.created_at, a.case_id, a.institution_id, (r.alert_id IS NOT NULL) AS read FROM alerts a
      LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = ? WHERE ${s.sql} AND a.resolved_at IS NULL ORDER BY a.created_at DESC LIMIT 8`).all(req.user.id, ...s.params);
    res.json({ ...row, latest });
  });
  r.post('/alerts/:id/read', (req, res) => {
    db.prepare('INSERT OR IGNORE INTO alert_reads (alert_id, user_id) VALUES (?,?)').run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });
  r.post('/alerts/read-all', (req, res) => {
    const s = alertScope(req.user);
    db.prepare(`INSERT OR IGNORE INTO alert_reads (alert_id, user_id) SELECT a.id, ? FROM alerts a WHERE ${s.sql} AND a.resolved_at IS NULL`).run(req.user.id, ...s.params);
    res.json({ ok: true });
  });

  // ---------- admin ----------
  r.get('/audit', requireRole('admin'), (req, res) => {
    const rows = db.prepare(`SELECT l.*, u.name AS user_name, u.username FROM audit_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT ?`).all(Math.min(1000, Number(req.query.limit) || 200));
    res.json(rows);
  });

  return r;
}
