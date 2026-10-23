// Case lifecycle: intake (with institution resolution + classification + overlap pre-check),
// workflow actions, transfer/escalation/disposal, linking and officer assignment.
import { actionByCode, categoryByCode, BUREAU_CODES, DISPOSAL_TYPES, PRIORITIES } from './domain.js';
import { InstitutionMatcher } from './matching.js';
import { classifyComplaint } from './classifier.js';
import { addDays, nowIso, today, tx } from './dbutil.js';
import { bus } from './engine.js';

const DEFAULT_DUE_DAYS = { FORWARDED: 15, REMINDER: 7, REPLY: 7, SCN: 15, HEARING: 10, INSPECTION: 10, ACCEPTED: 5, DIRECTION: 10, REOPEN: 7 };

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function canAct(user, c) {
  if (user.role === 'admin') return true;
  if (user.role === 'regional') return c.bureau_code === 'RO' && c.region_code === user.region_code;
  if (c.bureau_code === 'RO') return false;
  return c.bureau_code === user.bureau_code;
}

export function canView(user, c) {
  if (user.role === 'regional') return c.region_code === user.region_code || c.bureau_code === 'RO' && c.region_code === user.region_code;
  return true;
}

export class CaseService {
  constructor(db, engine, audit) {
    this.db = db;
    this.engine = engine;
    this.audit = audit;
  }

  get(id) {
    return this.db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
  }

  nextCaseNo(bureau, receivedOn) {
    const year = receivedOn.slice(0, 4);
    const prefix = `AICTE/${bureau}/${year}/`;
    const row = this.db.prepare("SELECT case_no FROM cases WHERE case_no LIKE ? ORDER BY case_no DESC LIMIT 1").get(prefix + '%');
    const seq = row ? Number(row.case_no.slice(prefix.length)) + 1 : 1;
    return prefix + String(seq).padStart(5, '0');
  }

  /** Least-loaded active officer of a Bureau (for RO: the region's officer). */
  autoAssignOfficer(bureau, regionCode) {
    const params = [bureau];
    let where = "u.bureau_code = ? AND u.active = 1 AND u.role IN ('officer','regional')";
    if (bureau === 'RO') { where += ' AND u.region_code = ?'; params.push(regionCode); }
    const row = this.db.prepare(`SELECT u.id, u.name, (SELECT COUNT(*) FROM cases c WHERE c.officer_id = u.id AND c.status != 'Disposed') AS load
      FROM users u WHERE ${where} ORDER BY load ASC, u.id ASC LIMIT 1`).get(...params);
    return row ?? null;
  }

  /** Pre-submission analysis shown on the intake form. */
  analyzeIntake({ institution_name, aicte_id, city, state, subject, description, complainant_email, complainant_phone }) {
    const candidates = this.engine.matcher.match({ name: institution_name, aicteId: aicte_id, city, state });
    const decision = InstitutionMatcher.decide(candidates);
    const classification = classifyComplaint(`${subject || ''}. ${description || ''}`);
    let existing = [];
    let similar = [];
    let overlap = null;
    const instId = decision.decision !== 'unresolved' ? decision.institution.id : null;
    if (instId) {
      existing = this.db.prepare(`SELECT c.id, c.case_no, c.bureau_code, c.status, c.category, c.subject, c.received_on, u.name AS officer_name
        FROM cases c LEFT JOIN users u ON u.id = c.officer_id WHERE c.institution_id = ? ORDER BY c.received_on DESC`).all(instId);
      const ids = existing.map((e) => e.id);
      const sims = this.engine.text.query(`${subject || ''} ${description || ''}`, ids, 5);
      const byId = new Map(existing.map((e) => [e.id, e]));
      similar = sims.filter((s) => s.score >= 0.2).map((s) => ({ ...byId.get(s.id), similarity: Number(s.score.toFixed(2)), terms: s.terms }));
      const activeBureaus = [...new Set(existing.filter((e) => e.status !== 'Disposed').map((e) => e.bureau_code))];
      const target = classification.suggestedBureau;
      const others = activeBureaus.filter((b) => b !== target);
      if (others.length) {
        overlap = {
          title: 'Potential Overlapping Cases – Coordination Required',
          message: `This institution already has active cases with ${others.join(', ')}. Registering this complaint with ${target} will create a cross-Bureau overlap.`,
          bureaus: activeBureaus,
        };
      }
    }
    if (complainant_email || complainant_phone) {
      const prior = this.db.prepare(`SELECT c.id, c.case_no, c.bureau_code, c.status, c.subject, c.received_on FROM cases c
        WHERE (? != '' AND c.complainant_email = ?) OR (? != '' AND c.complainant_phone = ?) ORDER BY c.received_on DESC LIMIT 5`)
        .all(complainant_email || '', complainant_email || '', complainant_phone || '', complainant_phone || '');
      for (const p of prior) if (!similar.some((s) => s.id === p.id)) similar.push({ ...p, similarity: null, terms: [], sameComplainant: true });
    }
    return {
      institution: { decision: decision.decision, candidates: candidates.map((c) => ({ ...c, score: Number(c.score.toFixed(2)) })) },
      classification,
      existing,
      similar,
      overlap,
    };
  }

  create(input, user) {
    const received = input.received_on || today();
    const category = input.category || classifyComplaint(`${input.subject}. ${input.description}`).category;
    const cat = categoryByCode[category];
    if (!cat) throw new HttpError(400, 'Unknown category');
    if (!input.subject?.trim() || !input.description?.trim()) throw new HttpError(400, 'Subject and description are required');
    const bureau = input.bureau_code || (user.role === 'admin' ? cat.bureau : user.bureau_code) || cat.bureau;
    if (!BUREAU_CODES.includes(bureau)) throw new HttpError(400, 'Unknown Bureau/Cell');
    const priority = PRIORITIES.includes(input.priority) ? input.priority : cat.priority;

    // Institution: explicit pick from intake form wins; otherwise resolve automatically.
    let institutionId = null, method = null, score = null;
    if (input.institution_id) {
      institutionId = Number(input.institution_id);
      if (!this.engine.instById.has(institutionId)) throw new HttpError(400, 'Unknown institution');
      method = input.aicte_id && this.engine.instById.get(institutionId).aicte_id === input.aicte_id ? 'aicte-id' : 'manual';
      score = 1;
    } else {
      const d = InstitutionMatcher.decide(this.engine.matcher.match({ name: input.institution_name, aicteId: input.aicte_id, city: input.city, state: input.state }));
      if (d.decision === 'auto') { institutionId = d.institution.id; method = d.method; score = d.score; }
      else if (d.decision === 'review') { method = 'review'; score = d.score; }
    }
    const inst = institutionId ? this.engine.instById.get(institutionId) : null;
    const region = inst?.region_code ?? input.region_code ?? user.region_code ?? null;

    const now = nowIso();
    const id = tx(this.db, () => {
      const caseNo = this.nextCaseNo(bureau, received);
      const officer = input.officer_id ? { id: Number(input.officer_id) } : this.autoAssignOfficer(bureau, region);
      const r = this.db.prepare(`INSERT INTO cases (case_no, external_ref, source, received_on, origin_bureau, bureau_code, officer_id, institution_id,
        institution_name_raw, aicte_id_raw, institution_city_raw, match_method, match_score, region_code, complainant_name, complainant_type,
        complainant_email, complainant_phone, category, subject, description, priority, status, last_action, last_action_on,
        next_action, next_action_due, expected_disposal, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        caseNo, input.external_ref || null, input.source || 'AICTE Grievance Portal', received, bureau, bureau, officer?.id ?? null, institutionId,
        input.institution_name || inst?.name || null, input.aicte_id || null, input.city || null, method, score, region,
        input.complainant_name || null, input.complainant_type || null, input.complainant_email || null, input.complainant_phone || null,
        category, input.subject.trim(), input.description.trim(), priority, 'Pending', 'Complaint registered', now,
        'Examine complaint and forward to institution', addDays(received, 3), addDays(received, cat.sla), now, now);
      const caseId = Number(r.lastInsertRowid);
      this.addActionRow(caseId, { at: now, actor: user.id, bureau, type: 'REGISTERED', from: null, to: 'Pending', remarks: `Received via ${input.source || 'AICTE Grievance Portal'}${input.external_ref ? ` (ref ${input.external_ref})` : ''}.` });
      if (officer) this.addActionRow(caseId, { at: now, actor: user.id, bureau, type: 'ASSIGNED', remarks: input.officer_id ? 'Assigned by registering official.' : 'Auto-assigned to least-loaded officer.' });
      return caseId;
    });
    const c = this.get(id);
    this.engine.indexCase(c);
    this.audit(user, 'case.create', 'case', c.case_no, { bureau, institutionId, method });
    const overlap = c.institution_id ? this.engine.overlapForInstitution(c.institution_id) : null;
    this.engine.refreshAlerts();
    bus.emit('event', { type: 'case.created', case_id: c.id, case_no: c.case_no, bureau: c.bureau_code, overlap: !!overlap, by: user.name });
    return { case: c, overlap };
  }

  addActionRow(caseId, { at, actor, bureau, type, from = null, to = null, fromBureau = null, toBureau = null, remarks = null, nextAction = null, nextDue = null }) {
    const r = this.db.prepare(`INSERT INTO case_actions (case_id, at, actor_id, bureau_code, action_type, from_status, to_status, from_bureau, to_bureau, remarks, next_action, next_action_due)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(caseId, at, actor, bureau, type, from, to, fromBureau, toBureau, remarks, nextAction, nextDue);
    return Number(r.lastInsertRowid);
  }

  /**
   * Record a workflow action. body: { type, remarks, next_action, next_action_due, to_bureau, disposal_type, officer_id }
   */
  act(caseId, body, user, files = []) {
    const c = this.get(caseId);
    if (!c) throw new HttpError(404, 'Case not found');
    const type = body.type;
    const def = actionByCode[type];
    if (!def) throw new HttpError(400, 'Unknown action type');
    const isDirection = type === 'DIRECTION';
    if (isDirection) {
      if (!(user.role === 'admin' || (user.role === 'head' && user.bureau_code === c.bureau_code))) throw new HttpError(403, 'Only the Competent Authority or Bureau Head can issue directions');
    } else if (!canAct(user, c)) {
      // Officials of other Bureaus/Cells may still leave a coordination note — that is how parallel
      // action is avoided — but it does not count as an action on the case itself.
      if (type === 'COORDINATION' && canView(user, c)) return this.coordinationNote(c, body, user);
      throw new HttpError(403, `This case is with ${c.bureau_code}; only that Bureau/Cell can act on it. Use a coordination note instead.`);
    }
    if (['REGISTERED', 'ASSIGNED', 'LINKED', 'INSTITUTION_RESOLVED'].includes(type)) throw new HttpError(400, 'This action is recorded automatically');
    if (c.status === 'Disposed' && !['REOPEN', 'NOTE'].includes(type)) throw new HttpError(400, 'Case is disposed. Reopen it first.');
    if (type === 'REOPEN' && c.status !== 'Disposed') throw new HttpError(400, 'Only disposed cases can be reopened');
    if (type === 'ACCEPTED' && c.status !== 'Transferred') throw new HttpError(400, 'Case is not awaiting transfer acceptance');
    if (c.status === 'Transferred' && !['ACCEPTED', 'NOTE', 'TRANSFER'].includes(type)) throw new HttpError(400, 'Accept the transfer before acting on this case');
    if (type === 'DIRECTION' && c.status !== 'Escalated') throw new HttpError(400, 'Directions apply to escalated cases');
    const remarks = (body.remarks || '').trim();
    if (['TRANSFER', 'ESCALATE', 'DISPOSE', 'REOPEN', 'DIRECTION'].includes(type) && !remarks) throw new HttpError(400, 'Remarks are required for this action');

    const now = nowIso();
    const updates = { updated_at: now, last_action: def.label, last_action_on: now };
    let toStatus = def.status ?? (c.status === 'Pending' && type !== 'NOTE' ? 'Under Process' : c.status);
    let fromBureau = null, toBureau = null;
    if (type === 'NOTE' || type === 'COORDINATION') toStatus = c.status === 'Pending' && type === 'COORDINATION' ? 'Under Process' : c.status;

    if (type === 'TRANSFER') {
      const target = body.to_bureau;
      if (!BUREAU_CODES.includes(target) || target === c.bureau_code) throw new HttpError(400, 'Choose a different Bureau/Cell to transfer to');
      fromBureau = c.bureau_code; toBureau = target;
      updates.bureau_code = target;
      updates.officer_id = null;
      updates.next_action = `Accept transfer and assign officer (${target})`;
      updates.next_action_due = addDays(today(), 3);
    } else if (type === 'ACCEPTED') {
      const officer = body.officer_id ? { id: Number(body.officer_id) } : (user.role === 'officer' || user.role === 'regional') && user.bureau_code === c.bureau_code ? { id: user.id } : this.autoAssignOfficer(c.bureau_code, c.region_code);
      updates.officer_id = officer?.id ?? null;
    } else if (type === 'ESCALATE') {
      updates.escalated_level = c.escalated_level + 1;
      updates.next_action = 'Await direction from Competent Authority';
      updates.next_action_due = addDays(today(), 7);
    } else if (type === 'DISPOSE') {
      if (!DISPOSAL_TYPES.includes(body.disposal_type)) throw new HttpError(400, 'Choose a disposal type');
      updates.disposed_on = now;
      updates.disposal_type = body.disposal_type;
      updates.disposal_remarks = remarks;
      updates.next_action = null;
      updates.next_action_due = null;
    } else if (type === 'REOPEN') {
      updates.disposed_on = null; updates.disposal_type = null; updates.disposal_remarks = null;
      updates.expected_disposal = addDays(today(), categoryByCode[c.category].sla);
    }
    if (!['TRANSFER', 'ESCALATE', 'DISPOSE'].includes(type)) {
      if (body.next_action !== undefined) updates.next_action = body.next_action || null;
      if (body.next_action_due !== undefined) updates.next_action_due = body.next_action_due || null;
      // A new next action without a date gets a sensible default instead of keeping the old date.
      if (body.next_action && !body.next_action_due) updates.next_action_due = addDays(today(), DEFAULT_DUE_DAYS[type] ?? 7);
    }
    if (body.priority && PRIORITIES.includes(body.priority)) updates.priority = body.priority;
    updates.status = toStatus;

    const actionId = tx(this.db, () => {
      const cols = Object.keys(updates);
      this.db.prepare(`UPDATE cases SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((k) => updates[k]), caseId);
      const aid = this.addActionRow(caseId, {
        at: now, actor: user.id, bureau: fromBureau ?? c.bureau_code, type, from: c.status, to: toStatus, fromBureau, toBureau, remarks: remarks || null,
        nextAction: updates.next_action ?? null, nextDue: updates.next_action_due ?? null,
      });
      for (const f of files) {
        this.db.prepare('INSERT INTO documents (case_id, action_id, filename, stored_name, mime, size, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(caseId, aid, f.originalname, f.filename, f.mimetype, f.size, user.id, now);
      }
      if (type === 'ACCEPTED' && updates.officer_id) this.addActionRow(caseId, { at: now, actor: user.id, bureau: c.bureau_code, type: 'ASSIGNED', remarks: 'Assigned on acceptance of transfer.' });
      return aid;
    });

    const updated = this.get(caseId);
    if (type === 'TRANSFER') {
      this.engine.raiseEventAlert({ key: `TRANSFER_IN:${actionId}`, type: 'TRANSFER_IN', severity: 'info', caseRow: updated, bureaus: [toBureau],
        title: `${c.case_no} transferred to ${toBureau} by ${fromBureau}`, message: remarks });
    } else if (type === 'ESCALATE') {
      this.engine.raiseEventAlert({ key: `ESCALATED:${actionId}`, type: 'ESCALATION', severity: 'critical', caseRow: updated, bureaus: [c.bureau_code],
        title: `${c.case_no} escalated to Competent Authority`, message: remarks });
    }
    this.audit(user, `case.action.${type.toLowerCase()}`, 'case', c.case_no, { from: c.status, to: toStatus, toBureau });
    this.engine.refreshAlerts();
    bus.emit('event', { type: 'case.updated', case_id: caseId, case_no: c.case_no, action: def.label, status: toStatus, bureau: updated.bureau_code, by: user.name });
    return updated;
  }

  coordinationNote(c, body, user) {
    const remarks = (body.remarks || '').trim();
    if (!remarks) throw new HttpError(400, 'Write the coordination note');
    const now = nowIso();
    this.addActionRow(c.id, { at: now, actor: user.id, bureau: user.bureau_code || 'ADMIN', type: 'COORDINATION', from: c.status, to: c.status, remarks });
    this.db.prepare('UPDATE cases SET updated_at = ? WHERE id = ?').run(now, c.id);
    this.audit(user, 'case.coordination_note', 'case', c.case_no, null);
    bus.emit('event', { type: 'case.updated', case_id: c.id, case_no: c.case_no, action: `Coordination note from ${user.bureau_code || 'administration'}`, bureau: c.bureau_code, by: user.name });
    return this.get(c.id);
  }

  assign(caseId, officerId, user) {
    const c = this.get(caseId);
    if (!c) throw new HttpError(404, 'Case not found');
    if (!(user.role === 'admin' || (user.role === 'head' && user.bureau_code === c.bureau_code))) throw new HttpError(403, 'Only the Bureau Head or Competent Authority can reassign');
    const officer = this.db.prepare('SELECT id, name, bureau_code FROM users WHERE id = ? AND active = 1').get(officerId);
    if (!officer || officer.bureau_code !== c.bureau_code) throw new HttpError(400, 'Officer must belong to the handling Bureau/Cell');
    const now = nowIso();
    tx(this.db, () => {
      this.db.prepare('UPDATE cases SET officer_id = ?, updated_at = ? WHERE id = ?').run(officer.id, now, caseId);
      this.addActionRow(caseId, { at: now, actor: user.id, bureau: c.bureau_code, type: 'ASSIGNED', remarks: `Assigned to ${officer.name}.` });
    });
    this.audit(user, 'case.assign', 'case', c.case_no, { officer: officer.name });
    bus.emit('event', { type: 'case.updated', case_id: caseId, case_no: c.case_no, action: `Assigned to ${officer.name}`, by: user.name });
    return this.get(caseId);
  }

  link(caseId, otherId, linkType, note, user) {
    const a = this.get(caseId), b = this.get(otherId);
    if (!a || !b) throw new HttpError(404, 'Case not found');
    if (a.id === b.id) throw new HttpError(400, 'Cannot link a case to itself');
    if (!['overlap', 'duplicate', 'related'].includes(linkType)) throw new HttpError(400, 'Invalid link type');
    const [x, y] = a.id < b.id ? [a, b] : [b, a];
    const now = nowIso();
    tx(this.db, () => {
      this.db.prepare(`INSERT INTO case_links (case_a, case_b, link_type, note, created_by, created_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(case_a, case_b) DO UPDATE SET link_type = excluded.link_type, note = excluded.note`).run(x.id, y.id, linkType, note || null, user.id, now);
      this.addActionRow(a.id, { at: now, actor: user.id, bureau: user.bureau_code || a.bureau_code, type: 'LINKED', remarks: `Linked as ${linkType} with ${b.case_no} (${b.bureau_code}).${note ? ' ' + note : ''}` });
      this.addActionRow(b.id, { at: now, actor: user.id, bureau: user.bureau_code || b.bureau_code, type: 'LINKED', remarks: `Linked as ${linkType} with ${a.case_no} (${a.bureau_code}).${note ? ' ' + note : ''}` });
    });
    this.audit(user, 'case.link', 'case', `${a.case_no}↔${b.case_no}`, { linkType });
    this.engine.refreshAlerts();
    this.db.prepare(`UPDATE alerts SET resolved_at = ? WHERE dedupe_key = ? AND resolved_at IS NULL`).run(now, `DUPLICATE:${x.id}-${y.id}`);
    bus.emit('event', { type: 'case.linked', case_id: a.id, case_no: a.case_no, other: b.case_no, by: user.name });
  }

  unlink(linkId, user) {
    const l = this.db.prepare('SELECT * FROM case_links WHERE id = ?').get(linkId);
    if (!l) throw new HttpError(404, 'Link not found');
    this.db.prepare('DELETE FROM case_links WHERE id = ?').run(linkId);
    this.audit(user, 'case.unlink', 'link', String(linkId), l);
    bus.emit('event', { type: 'case.updated', case_id: l.case_a, by: user.name });
  }

  dismissPair(aId, bId, user) {
    const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
    this.db.prepare('INSERT OR IGNORE INTO dismissed_pairs (case_a, case_b, dismissed_by, dismissed_at) VALUES (?,?,?,?)').run(x, y, user.id, nowIso());
    this.db.prepare(`UPDATE alerts SET resolved_at = ? WHERE dedupe_key = ? AND resolved_at IS NULL`).run(nowIso(), `DUPLICATE:${x}-${y}`);
    this.audit(user, 'duplicate.dismiss', 'case', `${x}-${y}`, null);
    bus.emit('event', { type: 'duplicates.updated', by: user.name });
  }

  resolveInstitution(caseId, institutionId, user) {
    const c = this.get(caseId);
    if (!c) throw new HttpError(404, 'Case not found');
    const inst = this.engine.instById.get(Number(institutionId));
    if (!inst) throw new HttpError(400, 'Unknown institution');
    const now = nowIso();
    tx(this.db, () => {
      this.db.prepare(`UPDATE cases SET institution_id = ?, region_code = ?, match_method = 'manual', match_score = 1, updated_at = ? WHERE id = ?`)
        .run(inst.id, inst.region_code, now, caseId);
      this.addActionRow(caseId, { at: now, actor: user.id, bureau: user.bureau_code || c.bureau_code, type: 'INSTITUTION_RESOLVED', remarks: `Reference "${c.institution_name_raw || c.aicte_id_raw}" confirmed as ${inst.name} (${inst.aicte_id}).` });
    });
    this.engine.indexCase(this.get(caseId));
    this.audit(user, 'case.resolve_institution', 'case', c.case_no, { institution: inst.aicte_id });
    const overlap = this.engine.overlapForInstitution(inst.id);
    this.engine.refreshAlerts();
    bus.emit('event', { type: 'case.updated', case_id: caseId, case_no: c.case_no, action: 'Institution identified', by: user.name, overlap: !!overlap });
    return { case: this.get(caseId), overlap };
  }

  reviewOverlap(institutionId, { status, lead_bureau, note }, user) {
    if (!['acknowledged', 'coordinated', 'dismissed', 'open'].includes(status)) throw new HttpError(400, 'Invalid status');
    const g = this.engine.overlapForInstitution(Number(institutionId));
    if (!g) throw new HttpError(404, 'No active overlap for this institution');
    if (user.role !== 'admin' && !g.bureaus.includes(user.bureau_code)) throw new HttpError(403, 'Only officials of the involved Bureaus/Cells can review this overlap');
    if (lead_bureau && !g.bureaus.includes(lead_bureau)) throw new HttpError(400, 'Lead Bureau must be one of the involved Bureaus/Cells');
    if (status === 'coordinated' && !lead_bureau) throw new HttpError(400, 'Designate a lead Bureau/Cell to mark coordinated');
    const now = nowIso();
    tx(this.db, () => {
      this.db.prepare(`INSERT INTO overlap_reviews (institution_id, status, lead_bureau, note, case_signature, reviewed_by, reviewed_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(institution_id) DO UPDATE SET status = excluded.status, lead_bureau = excluded.lead_bureau, note = excluded.note,
        case_signature = excluded.case_signature, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at`)
        .run(g.institution_id, status, lead_bureau || null, note || null, g.signature, user.id, now);
      const msg = `Overlap ${status}${lead_bureau ? ` — lead: ${lead_bureau}` : ''}${note ? `. ${note}` : ''}`;
      for (const c of g.cases) this.addActionRow(c.id, { at: now, actor: user.id, bureau: user.bureau_code || c.bureau_code, type: 'COORDINATION', remarks: msg });
      if (status === 'coordinated') {
        // Map all overlapping cases to each other so the relationship is preserved after disposal.
        for (let i = 0; i < g.cases.length; i++) for (let j = i + 1; j < g.cases.length; j++) {
          const [x, y] = g.cases[i].id < g.cases[j].id ? [g.cases[i], g.cases[j]] : [g.cases[j], g.cases[i]];
          this.db.prepare(`INSERT OR IGNORE INTO case_links (case_a, case_b, link_type, note, created_by, created_at) VALUES (?,?,?,?,?,?)`)
            .run(x.id, y.id, 'overlap', `Coordinated; lead ${lead_bureau}`, user.id, now);
        }
      }
    });
    this.audit(user, `overlap.${status}`, 'institution', g.institution?.aicte_id, { lead_bureau, note });
    this.engine.refreshAlerts();
    bus.emit('event', { type: 'overlap.updated', institution_id: g.institution_id, status, by: user.name });
    return this.engine.overlapForInstitution(g.institution_id);
  }
}
