// Real-time dashboard aggregates and MIS reports (all filterable; reports export to CSV).
import express from 'express';
import { caseFilter, toCsv } from './filters.js';
import { BUREAUS, REGIONS, CATEGORIES, SLA_APPROACHING_DAYS } from './domain.js';
import { HttpError } from './cases.js';

const AGE_BUCKETS = [
  { key: 'b0_15', label: '0–15 days', min: 0, max: 15 },
  { key: 'b16_30', label: '16–30 days', min: 16, max: 30 },
  { key: 'b31_60', label: '31–60 days', min: 31, max: 60 },
  { key: 'b61_90', label: '61–90 days', min: 61, max: 90 },
  { key: 'b90p', label: '> 90 days', min: 91, max: 100000 },
];
const AGE_SQL = AGE_BUCKETS.map((b) => `SUM(c.status != 'Disposed' AND (julianday(date('now')) - julianday(c.received_on)) BETWEEN ${b.min} AND ${b.max}) AS ${b.key}`).join(',\n');

const METRICS_SQL = `
  COUNT(*) AS received,
  SUM(c.status = 'Disposed') AS disposed,
  SUM(c.status != 'Disposed') AS pending,
  SUM(c.status = 'Pending') AS not_started,
  SUM(c.status = 'Under Process') AS under_process,
  SUM(c.status = 'Transferred') AS transferred_now,
  SUM(c.status = 'Escalated') AS escalated_now,
  SUM(c.status != 'Disposed' AND c.expected_disposal < date('now')) AS beyond_sla,
  SUM(c.status != 'Disposed' AND c.expected_disposal >= date('now') AND c.expected_disposal <= date('now', '+${SLA_APPROACHING_DAYS} days')) AS approaching,
  SUM(c.status = 'Disposed' AND substr(c.disposed_on, 1, 10) <= c.expected_disposal) AS disposed_in_sla,
  ROUND(AVG(CASE WHEN c.status = 'Disposed' THEN julianday(substr(c.disposed_on, 1, 10)) - julianday(c.received_on) END), 1) AS avg_disposal_days,
  ROUND(AVG(CASE WHEN c.status != 'Disposed' THEN julianday(date('now')) - julianday(c.received_on) END), 1) AS avg_pending_age,
  SUM(EXISTS (SELECT 1 FROM case_actions t WHERE t.case_id = c.id AND t.action_type = 'TRANSFER')) AS transferred,
  SUM(c.escalated_level > 0) AS escalated`;

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const derive = (r) => ({ ...r, disposal_rate: pct(r.disposed, r.received), sla_compliance: pct(r.disposed_in_sla, r.disposed) });

function months(n) {
  const out = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

export function buildAnalytics({ db, engine, audit }) {
  const r = express.Router();

  r.get('/dashboard', (req, res) => {
    const f = caseFilter(req.query, req.user, engine);
    const FROM = `FROM cases c LEFT JOIN institutions i ON i.id = c.institution_id WHERE ${f.sql}`;
    const k = derive(db.prepare(`SELECT ${METRICS_SQL},
        SUM(c.received_on = date('now')) AS received_today,
        SUM(substr(c.disposed_on, 1, 10) = date('now')) AS disposed_today,
        SUM(c.received_on >= date('now', '-30 days')) AS received_30d,
        SUM(c.disposed_on >= date('now', '-30 days')) AS disposed_30d,
        COUNT(DISTINCT c.institution_id) AS institutions,
        COUNT(DISTINCT CASE WHEN c.status != 'Disposed' THEN c.institution_id END) AS institutions_active,
        SUM(c.institution_id IS NULL) AS unresolved
      ${FROM}`).get(...f.params));

    const mlist = months(12);
    const trendRows = db.prepare(`SELECT substr(c.received_on, 1, 7) AS m, COUNT(*) AS received FROM cases c LEFT JOIN institutions i ON i.id = c.institution_id
      WHERE ${f.sql} AND c.received_on >= ? GROUP BY m`).all(...f.params, mlist[0] + '-01');
    const dispRows = db.prepare(`SELECT substr(c.disposed_on, 1, 7) AS m, COUNT(*) AS disposed, SUM(substr(c.disposed_on,1,10) <= c.expected_disposal) AS in_sla
      FROM cases c LEFT JOIN institutions i ON i.id = c.institution_id WHERE ${f.sql} AND c.disposed_on >= ? GROUP BY m`).all(...f.params, mlist[0] + '-01');
    const trend = mlist.map((m) => ({
      month: m,
      received: trendRows.find((x) => x.m === m)?.received ?? 0,
      disposed: dispRows.find((x) => x.m === m)?.disposed ?? 0,
      in_sla: dispRows.find((x) => x.m === m)?.in_sla ?? 0,
    }));

    const bureauRows = db.prepare(`SELECT c.bureau_code AS code, ${METRICS_SQL} ${FROM} GROUP BY c.bureau_code`).all(...f.params);
    const bureaus = BUREAUS.map((b) => derive({ code: b.code, name: b.name, ...(bureauRows.find((x) => x.code === b.code) ?? { received: 0, disposed: 0, pending: 0 }) }));

    const regionRows = db.prepare(`SELECT c.region_code AS code, ${METRICS_SQL} ${FROM} GROUP BY c.region_code`).all(...f.params);
    const regions = REGIONS.map((x) => derive({ code: x.code, name: x.name, office: x.office, ...(regionRows.find((y) => y.code === x.code) ?? { received: 0, disposed: 0, pending: 0 }) }));

    const ageRows = db.prepare(`SELECT c.bureau_code AS code, ${AGE_SQL} ${FROM} GROUP BY c.bureau_code`).all(...f.params);
    const ageing = AGE_BUCKETS.map((b) => {
      const row = { bucket: b.label };
      for (const br of BUREAUS) row[br.code] = ageRows.find((x) => x.code === br.code)?.[b.key] ?? 0;
      row.total = BUREAUS.reduce((s, br) => s + row[br.code], 0);
      return row;
    });

    const catRows = db.prepare(`SELECT c.category AS code, COUNT(*) AS total, SUM(c.status != 'Disposed') AS active ${FROM} GROUP BY c.category ORDER BY total DESC`).all(...f.params);
    const categories = catRows.map((x) => ({ ...x, name: CATEGORIES.find((c) => c.code === x.code)?.name ?? x.code }));

    const topInstitutions = db.prepare(`SELECT i.id, i.name, i.aicte_id, i.city, i.region_code,
        COUNT(*) AS total, SUM(c.status != 'Disposed') AS active,
        SUM(c.status != 'Disposed' AND c.expected_disposal < date('now')) AS breached,
        GROUP_CONCAT(DISTINCT CASE WHEN c.status != 'Disposed' THEN c.bureau_code END) AS bureaus,
        SUM(c.status = 'Pending') AS s_pending, SUM(c.status = 'Under Process') AS s_process, SUM(c.status = 'Transferred') AS s_transferred,
        SUM(c.status = 'Escalated') AS s_escalated, SUM(c.status = 'Disposed') AS s_disposed
      ${FROM} AND c.institution_id IS NOT NULL GROUP BY i.id HAVING active > 0 ORDER BY active DESC, breached DESC, total DESC LIMIT 10`).all(...f.params);
    const overlapIds = new Set(engine.overlapGroups().map((g) => g.institution_id));
    for (const t of topInstitutions) { t.bureaus = t.bureaus ? t.bureaus.split(',') : []; t.overlap = overlapIds.has(t.id); }

    const recent = db.prepare(`SELECT a.id, a.at, a.action_type, a.bureau_code, a.to_bureau, a.to_status, a.remarks, c.id AS case_id, c.case_no, i.name AS institution_name, u.name AS actor_name
      FROM case_actions a JOIN cases c ON c.id = a.case_id LEFT JOIN institutions i ON i.id = c.institution_id LEFT JOIN users u ON u.id = a.actor_id
      WHERE ${f.sql} AND a.action_type NOT IN ('ASSIGNED') ORDER BY a.at DESC, a.id DESC LIMIT 12`).all(...f.params);

    let groups = engine.overlapGroups();
    if (req.user.role === 'regional') groups = groups.filter((g) => g.institution?.region_code === req.user.region_code);
    if (req.query.region) groups = groups.filter((g) => req.query.region.split(',').includes(g.institution?.region_code));
    if (req.query.bureau) groups = groups.filter((g) => g.bureaus.some((b) => req.query.bureau.split(',').includes(b)));
    const overlaps = {
      open: groups.filter((g) => g.status === 'open').length,
      acknowledged: groups.filter((g) => g.status === 'acknowledged').length,
      coordinated: groups.filter((g) => g.status === 'coordinated').length,
      rbPgrc: groups.filter((g) => g.status === 'open' && g.bureaus.includes('RB') && g.bureaus.includes('PGRC')).length,
      cases: groups.reduce((s, g) => s + g.cases.length, 0),
      top: groups.filter((g) => g.status === 'open').slice(0, 5).map((g) => ({
        institution_id: g.institution_id, institution: g.institution, severity: g.severity, bureaus: g.bureaus, cases: g.cases.length, reasons: g.reasons.slice(0, 2),
      })),
    };
    res.json({ kpis: k, trend, bureaus, regions, ageing, categories, topInstitutions, recent, overlaps, generated_at: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------------------------
  // Reports

  const metricCols = [
    { key: 'received', label: 'Received', type: 'num' }, { key: 'disposed', label: 'Disposed', type: 'num' },
    { key: 'pending', label: 'Pending', type: 'num' }, { key: 'beyond_sla', label: 'Beyond timeline', type: 'num' },
    { key: 'transferred', label: 'Transferred', type: 'num' }, { key: 'escalated', label: 'Escalated', type: 'num' },
    { key: 'disposal_rate', label: 'Disposal rate %', type: 'pct' }, { key: 'sla_compliance', label: 'Disposed within timeline %', type: 'pct' },
    { key: 'avg_disposal_days', label: 'Avg. disposal (days)', type: 'num' }, { key: 'avg_pending_age', label: 'Avg. pending age (days)', type: 'num' },
  ];
  const totalsRow = (rows, label, labelKey) => {
    const t = { [labelKey]: label };
    for (const c of metricCols) if (['received', 'disposed', 'pending', 'beyond_sla', 'transferred', 'escalated', 'disposed_in_sla'].includes(c.key)) t[c.key] = rows.reduce((s, r) => s + (r[c.key] || 0), 0);
    t.disposed_in_sla = rows.reduce((s, r) => s + (r.disposed_in_sla || 0), 0);
    t.disposal_rate = pct(t.disposed, t.received);
    t.sla_compliance = pct(t.disposed_in_sla, t.disposed);
    return t;
  };

  const REPORTS = {
    bureau: (f, FROM) => {
      const rows = db.prepare(`SELECT c.bureau_code AS code, ${METRICS_SQL},
          (SELECT COUNT(*) FROM case_actions t JOIN cases c2 ON c2.id = t.case_id WHERE t.action_type = 'TRANSFER' AND t.to_bureau = c.bureau_code) AS transfers_in
        ${FROM} GROUP BY c.bureau_code`).all(...f.params).map(derive);
      const out = BUREAUS.map((b) => ({ name: `${b.name} (${b.code})`, ...(rows.find((r) => r.code === b.code) ?? {}) })).filter((r) => r.received);
      return { title: 'Bureau/Cell-wise report', columns: [{ key: 'name', label: 'Bureau/Cell' }, ...metricCols], rows: out, totals: totalsRow(out, 'All Bureaus/Cells', 'name'), chart: { x: 'code', series: ['disposed', 'pending', 'beyond_sla'] } };
    },
    region: (f, FROM) => {
      const rows = db.prepare(`SELECT c.region_code AS code, ${METRICS_SQL}, COUNT(DISTINCT c.institution_id) AS institutions ${FROM} GROUP BY c.region_code`).all(...f.params).map(derive);
      const out = REGIONS.map((x) => ({ name: `${x.name} (${x.office})`, ...(rows.find((r) => r.code === x.code) ?? {}) })).filter((r) => r.received);
      const unk = rows.find((r) => !r.code);
      if (unk) out.push({ name: 'Region not identified', ...unk });
      return { title: 'Region-wise report', columns: [{ key: 'name', label: 'Region (office)' }, { key: 'institutions', label: 'Institutions', type: 'num' }, ...metricCols], rows: out, totals: totalsRow(out, 'All regions', 'name'), chart: { x: 'code', series: ['disposed', 'pending', 'beyond_sla'] } };
    },
    status: (f, FROM) => {
      const rows = db.prepare(`SELECT c.status, COUNT(*) AS cases, SUM(c.expected_disposal < date('now') AND c.status != 'Disposed') AS beyond_sla,
          ROUND(AVG(julianday(COALESCE(substr(c.disposed_on,1,10), date('now'))) - julianday(c.received_on)), 1) AS avg_age
        ${FROM} GROUP BY c.status`).all(...f.params);
      const total = rows.reduce((s, r) => s + r.cases, 0);
      const order = ['Pending', 'Under Process', 'Transferred', 'Escalated', 'Disposed'];
      const out = order.map((s) => rows.find((r) => r.status === s) ?? { status: s, cases: 0, beyond_sla: 0, avg_age: null }).map((r) => ({ ...r, share: pct(r.cases, total) }));
      return { title: 'Status-wise report', columns: [{ key: 'status', label: 'Status' }, { key: 'cases', label: 'Cases', type: 'num' }, { key: 'share', label: 'Share %', type: 'pct' }, { key: 'beyond_sla', label: 'Beyond timeline', type: 'num' }, { key: 'avg_age', label: 'Avg. age (days)', type: 'num' }], rows: out, totals: { status: 'Total', cases: total }, chart: { x: 'status', series: ['cases'] } };
    },
    category: (f, FROM) => {
      const rows = db.prepare(`SELECT c.category AS code, ${METRICS_SQL} ${FROM} GROUP BY c.category ORDER BY received DESC`).all(...f.params).map(derive);
      const out = rows.map((r) => { const c = CATEGORIES.find((x) => x.code === r.code); return { name: c?.name ?? r.code, sla: c?.sla, ...r }; });
      return { title: 'Category-wise report', columns: [{ key: 'name', label: 'Category' }, { key: 'sla', label: 'Timeline (days)', type: 'num' }, ...metricCols], rows: out, totals: totalsRow(out, 'All categories', 'name'), chart: { x: 'code', series: ['disposed', 'pending', 'beyond_sla'] } };
    },
    institution: (f, FROM) => {
      const rows = db.prepare(`SELECT i.id, i.name, i.aicte_id, i.city, i.state, c.region_code AS region, ${METRICS_SQL},
          COUNT(DISTINCT c.bureau_code) AS bureaus_involved, GROUP_CONCAT(DISTINCT c.bureau_code) AS bureaus, MAX(c.received_on) AS last_received
        ${FROM} AND c.institution_id IS NOT NULL GROUP BY i.id ORDER BY received DESC, pending DESC LIMIT 300`).all(...f.params).map(derive);
      return {
        title: 'Institution-wise complaint history',
        columns: [{ key: 'name', label: 'Institution', link: 'institution' }, { key: 'aicte_id', label: 'AICTE Permanent ID' }, { key: 'city', label: 'City' }, { key: 'region', label: 'Region' },
          { key: 'received', label: 'Complaints', type: 'num' }, { key: 'pending', label: 'Pending', type: 'num' }, { key: 'disposed', label: 'Disposed', type: 'num' },
          { key: 'beyond_sla', label: 'Beyond timeline', type: 'num' }, { key: 'bureaus', label: 'Bureaus/Cells involved' }, { key: 'last_received', label: 'Last complaint' }],
        rows,
      };
    },
    ageing: (f, FROM) => {
      const rows = db.prepare(`SELECT c.bureau_code AS code, ${AGE_SQL}, SUM(c.status != 'Disposed') AS pending,
          SUM(c.status != 'Disposed' AND c.expected_disposal < date('now')) AS beyond_sla ${FROM} GROUP BY c.bureau_code`).all(...f.params);
      const out = BUREAUS.map((b) => ({ name: `${b.name} (${b.code})`, code: b.code, ...(rows.find((r) => r.code === b.code) ?? {}) })).filter((r) => r.pending);
      const totals = { name: 'Total' };
      for (const k of [...AGE_BUCKETS.map((b) => b.key), 'pending', 'beyond_sla']) totals[k] = out.reduce((s, r) => s + (r[k] || 0), 0);
      return { title: 'Pending case ageing analysis', columns: [{ key: 'name', label: 'Bureau/Cell' }, ...AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, type: 'num' })), { key: 'pending', label: 'Total pending', type: 'num' }, { key: 'beyond_sla', label: 'Beyond timeline', type: 'num' }], rows: out, totals, chart: { x: 'code', series: AGE_BUCKETS.map((b) => b.key), stacked: true, labels: Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, b.label])), ordinal: true } };
    },
    disposal: (f, FROM) => {
      const rows = db.prepare(`SELECT c.bureau_code AS code, COUNT(*) AS disposed,
          SUM(substr(c.disposed_on,1,10) <= c.expected_disposal) AS in_sla,
          ROUND(AVG(julianday(substr(c.disposed_on,1,10)) - julianday(c.received_on)), 1) AS avg_days,
          MIN(CAST(julianday(substr(c.disposed_on,1,10)) - julianday(c.received_on) AS INTEGER)) AS min_days,
          MAX(CAST(julianday(substr(c.disposed_on,1,10)) - julianday(c.received_on) AS INTEGER)) AS max_days,
          SUM(c.disposal_type LIKE 'Resolved%') AS resolved, SUM(c.disposal_type IN ('Action taken against institution','Penalty / restriction imposed')) AS action_taken,
          SUM(c.disposal_type LIKE 'Closed%') AS closed, SUM(c.disposal_type IN ('Withdrawn by complainant','Merged with related case')) AS other
        ${FROM} AND c.status = 'Disposed' GROUP BY c.bureau_code`).all(...f.params);
      const recv = db.prepare(`SELECT c.bureau_code AS code, COUNT(*) AS received ${FROM} GROUP BY c.bureau_code`).all(...f.params);
      const out = BUREAUS.map((b) => {
        const r = rows.find((x) => x.code === b.code) ?? { disposed: 0 };
        const rc = recv.find((x) => x.code === b.code)?.received ?? 0;
        return { name: `${b.name} (${b.code})`, code: b.code, received: rc, ...r, disposal_rate: pct(r.disposed, rc), sla_compliance: pct(r.in_sla, r.disposed) };
      }).filter((r) => r.received);
      return { title: 'Disposal rate & outcome analysis', columns: [{ key: 'name', label: 'Bureau/Cell' }, { key: 'received', label: 'Received', type: 'num' }, { key: 'disposed', label: 'Disposed', type: 'num' }, { key: 'disposal_rate', label: 'Disposal rate %', type: 'pct' }, { key: 'sla_compliance', label: 'Within timeline %', type: 'pct' }, { key: 'avg_days', label: 'Avg. days', type: 'num' }, { key: 'max_days', label: 'Longest (days)', type: 'num' }, { key: 'resolved', label: 'Relief provided', type: 'num' }, { key: 'action_taken', label: 'Action / penalty', type: 'num' }, { key: 'closed', label: 'Closed', type: 'num' }, { key: 'other', label: 'Withdrawn / merged', type: 'num' }], rows: out, chart: { x: 'code', series: ['disposal_rate', 'sla_compliance'], percent: true } };
    },
    overlaps: (_f, _FROM, req) => {
      let groups = engine.overlapGroups({ includeDismissed: true });
      if (req.user.role === 'regional') groups = groups.filter((g) => g.institution?.region_code === req.user.region_code);
      if (req.query.region) groups = groups.filter((g) => req.query.region.split(',').includes(g.institution?.region_code));
      if (req.query.bureau) groups = groups.filter((g) => g.bureaus.some((b) => req.query.bureau.split(',').includes(b)));
      const dups = engine.duplicatePairs();
      const rows = groups.map((g) => ({
        institution_id: g.institution_id, name: g.institution?.name, aicte_id: g.institution?.aicte_id, region: g.institution?.region_code,
        bureaus: g.bureaus.join(', '), cases: g.cases.map((c) => c.case_no).join('; '), active_cases: g.cases.length,
        severity: g.severity, status: g.status, lead_bureau: g.lead_bureau ?? '', duplicates: dups.filter((d) => d.institution.id === g.institution_id).length,
      }));
      return { title: 'Overlapping / duplicate cases', columns: [{ key: 'name', label: 'Institution', link: 'institution' }, { key: 'aicte_id', label: 'AICTE Permanent ID' }, { key: 'region', label: 'Region' }, { key: 'bureaus', label: 'Bureaus/Cells' }, { key: 'active_cases', label: 'Active cases', type: 'num' }, { key: 'cases', label: 'Case IDs' }, { key: 'duplicates', label: 'Likely duplicates', type: 'num' }, { key: 'severity', label: 'Severity' }, { key: 'status', label: 'Coordination status' }, { key: 'lead_bureau', label: 'Lead Bureau' }], rows, summary: { groups: rows.length, open: rows.filter((r) => r.status === 'open').length, duplicatePairs: dups.length, crossBureauDuplicates: dups.filter((d) => d.crossBureau).length } };
    },
    performance: (f, FROM, req) => {
      const quarterly = req.query.period === 'quarterly';
      const key = (col) => (quarterly ? `substr(${col},1,4) || '-Q' || ((CAST(substr(${col},6,2) AS INTEGER) + 2) / 3)` : `substr(${col},1,7)`);
      const rec = db.prepare(`SELECT ${key('c.received_on')} AS p, COUNT(*) AS received ${FROM} GROUP BY p`).all(...f.params);
      const disp = db.prepare(`SELECT ${key('c.disposed_on')} AS p, COUNT(*) AS disposed, SUM(substr(c.disposed_on,1,10) <= c.expected_disposal) AS in_sla,
        ROUND(AVG(julianday(substr(c.disposed_on,1,10)) - julianday(c.received_on)), 1) AS avg_days ${FROM} AND c.disposed_on IS NOT NULL GROUP BY p`).all(...f.params);
      const periods = [...new Set([...rec.map((r) => r.p), ...disp.map((r) => r.p)])].filter(Boolean).sort();
      let opening = 0;
      const rows = periods.map((p) => {
        const r = rec.find((x) => x.p === p)?.received ?? 0;
        const d = disp.find((x) => x.p === p) ?? { disposed: 0, in_sla: 0, avg_days: null };
        const row = { period: p, opening, received: r, disposed: d.disposed, closing: opening + r - d.disposed, in_sla: d.in_sla, sla_compliance: pct(d.in_sla, d.disposed), avg_days: d.avg_days, clearance_rate: pct(d.disposed, r) };
        opening = row.closing;
        return row;
      });
      return { title: `${quarterly ? 'Quarterly' : 'Monthly'} performance report`, columns: [{ key: 'period', label: quarterly ? 'Quarter' : 'Month' }, { key: 'opening', label: 'Opening pendency', type: 'num' }, { key: 'received', label: 'Received', type: 'num' }, { key: 'disposed', label: 'Disposed', type: 'num' }, { key: 'closing', label: 'Closing pendency', type: 'num' }, { key: 'clearance_rate', label: 'Clearance rate %', type: 'pct' }, { key: 'sla_compliance', label: 'Within timeline %', type: 'pct' }, { key: 'avg_days', label: 'Avg. disposal (days)', type: 'num' }], rows, chart: { x: 'period', series: ['received', 'disposed'], line: 'closing' } };
    },
    officer: (f, FROM) => {
      const rows = db.prepare(`SELECT u.name, u.designation, u.bureau_code AS bureau, u.region_code AS region, SUM(c.status != 'Disposed') AS pending,
          SUM(c.status != 'Disposed' AND c.expected_disposal < date('now')) AS beyond_sla,
          SUM(c.status = 'Disposed' AND c.disposed_on >= date('now','-90 days')) AS disposed_90d,
          ROUND(AVG(CASE WHEN c.status = 'Disposed' THEN julianday(substr(c.disposed_on,1,10)) - julianday(c.received_on) END), 1) AS avg_disposal_days,
          ROUND(AVG(CASE WHEN c.status != 'Disposed' THEN julianday(date('now')) - julianday(c.received_on) END), 1) AS avg_pending_age
        ${FROM.replace('FROM cases c', 'FROM cases c JOIN users u ON u.id = c.officer_id')} GROUP BY u.id ORDER BY pending DESC`).all(...f.params);
      return { title: 'Officer-wise workload', columns: [{ key: 'name', label: 'Officer' }, { key: 'designation', label: 'Designation' }, { key: 'bureau', label: 'Bureau/Cell' }, { key: 'region', label: 'Region' }, { key: 'pending', label: 'Pending', type: 'num' }, { key: 'beyond_sla', label: 'Beyond timeline', type: 'num' }, { key: 'disposed_90d', label: 'Disposed (90 days)', type: 'num' }, { key: 'avg_disposal_days', label: 'Avg. disposal (days)', type: 'num' }, { key: 'avg_pending_age', label: 'Avg. pending age', type: 'num' }], rows };
    },
  };

  r.get('/reports/:type', (req, res) => {
    const fn = REPORTS[req.params.type];
    if (!fn) throw new HttpError(404, 'Unknown report');
    const f = caseFilter(req.query, req.user, engine);
    const FROM = `FROM cases c LEFT JOIN institutions i ON i.id = c.institution_id WHERE ${f.sql}`;
    const report = fn(f, FROM, req);
    report.generated_at = new Date().toISOString();
    report.filters = Object.fromEntries(Object.entries(req.query).filter(([k]) => !['format', 'token'].includes(k)));
    if (req.query.format === 'csv') {
      audit(req.user, 'export.report', 'report', req.params.type, report.filters);
      const rows = report.totals ? [...report.rows, report.totals] : report.rows;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="aicte-${req.params.type}-report-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(toCsv(report.columns, rows));
    }
    res.json(report);
  });

  return r;
}
