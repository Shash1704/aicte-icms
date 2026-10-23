// Monitoring engine: SLA state, cross-Bureau overlap detection, duplicate detection and alerts.
import { EventEmitter } from 'node:events';
import { InstitutionMatcher, TextIndex } from './matching.js';
import {
  ACTIVE_STATUSES, BUREAUS, PENDING_REMINDER_DAYS, SLA_APPROACHING_DAYS, AUTO_ESCALATION_OVERDUE_DAYS,
} from './domain.js';
import { daysBetween, nowIso, today, addDays } from './dbutil.js';

export const bus = new EventEmitter();
bus.setMaxListeners(500);

const bureauName = Object.fromEntries(BUREAUS.map((b) => [b.code, b.name]));
const DUP_TEXT_THRESHOLD = 0.42; // cosine similarity above which two complaints likely describe the same issue
const DUP_WINDOW_DAYS = 180;

export function slaInfo(c, on = today()) {
  const end = c.status === 'Disposed' ? c.disposed_on?.slice(0, 10) ?? on : on;
  const daysLeft = daysBetween(end, c.expected_disposal);
  const age = daysBetween(c.received_on, end);
  const total = Math.max(1, daysBetween(c.received_on, c.expected_disposal));
  let state;
  if (c.status === 'Disposed') state = daysLeft >= 0 ? 'met' : 'missed';
  else if (daysLeft < 0) state = 'breached';
  else if (daysLeft <= SLA_APPROACHING_DAYS) state = 'approaching';
  else state = 'on-track';
  return { state, daysLeft, age, total, pctUsed: Math.round((age / total) * 100) };
}

export class Engine {
  constructor(db) {
    this.db = db;
    this.text = new TextIndex();
    this.matcher = new InstitutionMatcher([]);
  }

  init() {
    this.reloadInstitutions();
    for (const c of this.db.prepare('SELECT id, subject, description, institution_id, institution_name_raw, institution_city_raw FROM cases').all()) {
      this.indexCase(c);
    }
    return this;
  }

  reloadInstitutions() {
    this.institutions = this.db.prepare('SELECT * FROM institutions').all();
    this.matcher.rebuild(this.institutions);
    this.instById = new Map(this.institutions.map((i) => [i.id, i]));
  }

  // Index complaint text for similarity. Words from the institution's own name/city are removed
  // first: two complaints about one institution always share those, and they say nothing
  // about whether the *grievance* is the same.
  indexCase(c) {
    const inst = c.institution_id ? this.instById.get(c.institution_id) : null;
    const nameWords = [inst?.name, inst?.city, ...(inst ? JSON.parse(inst.aliases || '[]') : []), c.institution_name_raw, c.institution_city_raw]
      .filter(Boolean).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const drop = new Set(nameWords);
    const text = `${c.subject} ${c.description}`.split(/(\s+)/).filter((w) => !drop.has(w.toLowerCase().replace(/[^a-z0-9]/g, ''))).join('');
    this.text.add(c.id, text);
  }

  // -------------------------------------------------------------------------------------------
  // Overlap detection: an institution with active cases in two or more Bureaus/Cells.

  activeCasesByInstitution() {
    const rows = this.db.prepare(`
      SELECT c.id, c.case_no, c.institution_id, c.bureau_code, c.status, c.category, c.subject, c.received_on,
             c.last_action, c.last_action_on, c.match_method, c.match_score, c.aicte_id_raw, c.institution_name_raw,
             c.officer_id, u.name AS officer_name, c.priority, c.complainant_email, c.complainant_phone, c.complainant_name
      FROM cases c LEFT JOIN users u ON u.id = c.officer_id
      WHERE c.institution_id IS NOT NULL AND c.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
      ORDER BY c.received_on`).all(...ACTIVE_STATUSES);
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.institution_id)) map.set(r.institution_id, []);
      map.get(r.institution_id).push(r);
    }
    return map;
  }

  matchReason(c) {
    if (c.match_method === 'aicte-id') return `AICTE Permanent ID quoted (${c.aicte_id_raw})`;
    if (c.match_method === 'manual') return 'Institution confirmed by officer';
    if (c.match_method === 'acronym') return `Acronym "${c.institution_name_raw}" resolved (${Math.round((c.match_score || 0) * 100)}%)`;
    if (c.match_method === 'fuzzy-name') return `Name "${c.institution_name_raw}" matched (${Math.round((c.match_score || 0) * 100)}%)`;
    return 'Linked to institution';
  }

  /** All overlap groups (computed live) merged with their coordination review state. */
  overlapGroups({ includeDismissed = false } = {}) {
    const reviews = new Map(this.db.prepare('SELECT * FROM overlap_reviews').all().map((r) => [r.institution_id, r]));
    const groups = [];
    for (const [instId, cases] of this.activeCasesByInstitution()) {
      const bureaus = [...new Set(cases.map((c) => c.bureau_code))];
      if (bureaus.length < 2) continue;
      const inst = this.instById.get(instId);
      const signature = cases.map((c) => c.id).sort((a, b) => a - b).join(',');
      const review = reviews.get(instId);
      let status = 'open';
      let reopened = false;
      if (review) {
        if (review.case_signature === signature) status = review.status;
        else if (review.status !== 'open') reopened = true; // new case joined since last review
      }
      if (status === 'dismissed' && !includeDismissed) continue;

      // Pairwise cross-bureau similarity — "is this the same issue?"
      const pairs = [];
      for (let i = 0; i < cases.length; i++) {
        for (let j = i + 1; j < cases.length; j++) {
          const a = cases[i], b = cases[j];
          if (a.bureau_code === b.bureau_code) continue;
          const sim = this.text.compare(a.id, b.id);
          const sameCategory = a.category === b.category;
          const sameComplainant = (a.complainant_email && a.complainant_email === b.complainant_email) ||
            (a.complainant_phone && a.complainant_phone === b.complainant_phone);
          if (sim.score >= 0.25 || sameCategory || sameComplainant) {
            pairs.push({ a: a.case_no, b: b.case_no, aId: a.id, bId: b.id, similarity: Number(sim.score.toFixed(2)), terms: sim.terms, sameCategory, sameComplainant: !!sameComplainant });
          }
        }
      }
      const hasRbPgrc = bureaus.includes('RB') && bureaus.includes('PGRC');
      const sameIssue = pairs.some((p) => p.similarity >= DUP_TEXT_THRESHOLD || p.sameComplainant);
      const severity = hasRbPgrc && (sameIssue || pairs.some((p) => p.sameCategory)) ? 'critical' : hasRbPgrc || sameIssue ? 'serious' : 'warning';

      const reasons = [
        `${cases.length} active cases on the same institution handled by ${bureaus.length} Bureaus/Cells (${bureaus.join(', ')})`,
      ];
      if (hasRbPgrc) reasons.push('Both Regulation Bureau and PGRC are acting — risk of parallel/conflicting action');
      const best = [...pairs].sort((x, y) => y.similarity - x.similarity)[0];
      if (best && best.similarity >= 0.25) reasons.push(`${best.a} and ${best.b} are ${Math.round(best.similarity * 100)}% similar in content (${best.terms.slice(0, 4).join(', ')})`);
      const sc = pairs.find((p) => p.sameComplainant);
      if (sc) reasons.push(`Same complainant in ${sc.a} and ${sc.b}`);
      const fuzzy = cases.filter((c) => c.match_method && c.match_method !== 'aicte-id');
      if (fuzzy.length) reasons.push(`${fuzzy.length} case(s) linked by name matching even though no AICTE ID was quoted`);

      groups.push({
        institution_id: instId,
        institution: inst && { id: inst.id, name: inst.name, aicte_id: inst.aicte_id, city: inst.city, state: inst.state, region_code: inst.region_code },
        title: 'Potential Overlapping Cases – Coordination Required',
        severity,
        bureaus,
        cases: cases.map((c) => ({ ...c, bureau_name: bureauName[c.bureau_code], match_reason: this.matchReason(c) })),
        pairs,
        reasons,
        signature,
        status,
        reopened,
        lead_bureau: review?.lead_bureau ?? null,
        note: review?.note ?? null,
        reviewed_at: review?.reviewed_at ?? null,
        reviewed_by: review?.reviewed_by ?? null,
        since: cases.reduce((m, c) => (c.received_on > m ? c.received_on : m), ''),
      });
    }
    const sevRank = { critical: 0, serious: 1, warning: 2 };
    const stRank = { open: 0, acknowledged: 1, coordinated: 2, dismissed: 3 };
    return groups.sort((a, b) => stRank[a.status] - stRank[b.status] || sevRank[a.severity] - sevRank[b.severity] || b.since.localeCompare(a.since));
  }

  overlapForInstitution(instId) {
    return this.overlapGroups({ includeDismissed: true }).find((g) => g.institution_id === instId) ?? null;
  }

  // -------------------------------------------------------------------------------------------
  // Duplicate detection: pairs of complaints (any Bureau) that look like the same grievance.

  duplicatePairs({ caseId = null, limit = 500 } = {}) {
    const rows = this.db.prepare(`
      SELECT c.id, c.case_no, c.institution_id, c.bureau_code, c.status, c.category, c.subject, c.received_on,
             c.complainant_name, c.complainant_email, c.complainant_phone
      FROM cases c WHERE c.institution_id IS NOT NULL ${caseId ? 'AND c.institution_id = (SELECT institution_id FROM cases WHERE id = ?)' : ''}
      ORDER BY c.institution_id, c.received_on`).all(...(caseId ? [caseId] : []));
    const dismissed = new Set(this.db.prepare('SELECT case_a, case_b FROM dismissed_pairs').all().map((r) => `${r.case_a}-${r.case_b}`));
    const linked = new Map(this.db.prepare('SELECT case_a, case_b, link_type FROM case_links').all().map((r) => [`${Math.min(r.case_a, r.case_b)}-${Math.max(r.case_a, r.case_b)}`, r.link_type]));
    const byInst = new Map();
    for (const r of rows) {
      if (!byInst.has(r.institution_id)) byInst.set(r.institution_id, []);
      byInst.get(r.institution_id).push(r);
    }
    const out = [];
    for (const [instId, list] of byInst) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (caseId && a.id !== caseId && b.id !== caseId) continue;
          if (Math.abs(daysBetween(a.received_on, b.received_on)) > DUP_WINDOW_DAYS) continue;
          if (a.status === 'Disposed' && b.status === 'Disposed') continue;
          const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
          if (dismissed.has(key)) continue;
          const sim = this.text.compare(a.id, b.id);
          const sameComplainant = (a.complainant_email && a.complainant_email === b.complainant_email) ||
            (a.complainant_phone && a.complainant_phone === b.complainant_phone);
          const score = Math.min(1, sim.score + (sameComplainant ? 0.3 : 0) + (a.category === b.category ? 0.05 : 0));
          if (score < DUP_TEXT_THRESHOLD) continue;
          const reasons = [`Content similarity ${Math.round(sim.score * 100)}% — common terms: ${sim.terms.join(', ') || '—'}`];
          if (sameComplainant) reasons.push(`Same complainant (${a.complainant_email === b.complainant_email ? a.complainant_email : a.complainant_phone})`);
          if (a.category === b.category) reasons.push('Same complaint category');
          reasons.push(a.bureau_code === b.bureau_code ? `Both with ${a.bureau_code}` : `Filed with different Bureaus/Cells (${a.bureau_code} & ${b.bureau_code})`);
          out.push({
            key, score: Number(score.toFixed(2)), similarity: Number(sim.score.toFixed(2)), terms: sim.terms,
            crossBureau: a.bureau_code !== b.bureau_code, sameComplainant: !!sameComplainant,
            linked: linked.get(key) ?? null, reasons,
            institution: { id: instId, name: this.instById.get(instId)?.name, aicte_id: this.instById.get(instId)?.aicte_id },
            a, b,
          });
        }
      }
    }
    return out.sort((x, y) => (x.linked ? 1 : 0) - (y.linked ? 1 : 0) || y.score - x.score).slice(0, limit);
  }

  similarCases(caseId, k = 6) {
    const ids = [...this.text.docs.keys()].filter((id) => id !== caseId);
    const vec = this.text.vector(caseId);
    const scored = [];
    for (const id of ids) {
      const s = TextIndex.cosine(vec, this.text.vector(id));
      if (s >= 0.2) scored.push({ id, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, k);
    if (!top.length) return [];
    const rows = this.db.prepare(`SELECT c.id, c.case_no, c.subject, c.status, c.bureau_code, c.received_on, i.name AS institution_name, c.institution_id
      FROM cases c LEFT JOIN institutions i ON i.id = c.institution_id WHERE c.id IN (${top.map(() => '?').join(',')})`).all(...top.map((t) => t.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return top.map((t) => ({ ...byId.get(t.id), similarity: Number(t.score.toFixed(2)), terms: this.text.compare(caseId, t.id).terms }));
  }

  // -------------------------------------------------------------------------------------------
  // Alerts. Idempotent: each condition has a dedupe key, so re-running never duplicates alerts.

  refreshAlerts({ emit = true } = {}) {
    const db = this.db;
    const t = today();
    const insert = db.prepare(`INSERT INTO alerts (dedupe_key, type, severity, case_id, institution_id, bureau_code, region_code, title, message, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`);
    let created = 0;
    const add = (key, type, sev, c, title, msg, at, bureaus) => {
      const r = insert.run(key, type, sev, c?.id ?? null, c?.institution_id ?? null, `,${(bureaus ?? [c.bureau_code]).join(',')},`, c?.region_code ?? null, title, msg, at);
      created += Number(r.changes);
    };

    const active = db.prepare(`SELECT c.*, i.name AS institution_name FROM cases c LEFT JOIN institutions i ON i.id = c.institution_id
      WHERE c.status != 'Disposed'`).all();
    for (const c of active) {
      const s = slaInfo(c, t);
      const inst = c.institution_name || c.institution_name_raw || 'Unidentified institution';
      if (s.state === 'breached') {
        add(`SLA_BREACH:${c.id}:${c.expected_disposal}`, 'SLA_BREACH', 'serious', c,
          `${c.case_no} crossed prescribed timeline`, `${inst} — expected disposal ${c.expected_disposal}; now overdue.`, `${addDays(c.expected_disposal, 1)}T04:30:00.000Z`);
        if (-s.daysLeft >= AUTO_ESCALATION_OVERDUE_DAYS && c.status !== 'Escalated') {
          add(`ESCALATION_DUE:${c.id}:${c.expected_disposal}`, 'ESCALATION', 'critical', c,
            `${c.case_no} overdue ${AUTO_ESCALATION_OVERDUE_DAYS}+ days — escalation recommended`, `${inst} — consider escalation to the Competent Authority.`, `${addDays(c.expected_disposal, AUTO_ESCALATION_OVERDUE_DAYS)}T04:30:00.000Z`);
        }
      } else if (s.state === 'approaching') {
        add(`SLA_APPROACHING:${c.id}:${c.expected_disposal}`, 'SLA_APPROACHING', 'warning', c,
          `${c.case_no} due in ${s.daysLeft} day(s)`, `${inst} — expected disposal ${c.expected_disposal}.`, `${addDays(c.expected_disposal, -SLA_APPROACHING_DAYS)}T04:30:00.000Z`);
      }
      const last = c.last_action_on || c.received_on;
      if (daysBetween(last, t) >= PENDING_REMINDER_DAYS && c.status !== 'Transferred') {
        add(`PENDING:${c.id}:${last.slice(0, 10)}`, 'PENDING_REMINDER', 'warning', c,
          `No action on ${c.case_no} for ${daysBetween(last, t)} days`, `${inst} — last action: ${c.last_action || 'none'}.`, `${addDays(last.slice(0, 10), PENDING_REMINDER_DAYS)}T04:30:00.000Z`);
      }
      if (c.status === 'Transferred' && daysBetween(c.last_action_on, t) >= 3) {
        add(`TRANSFER_STALE:${c.id}:${c.last_action_on.slice(0, 10)}`, 'PENDING_REMINDER', 'warning', c,
          `${c.case_no} transferred to ${c.bureau_code} but not yet accepted`, `${inst} — transferred on ${c.last_action_on.slice(0, 10)}.`, `${addDays(c.last_action_on.slice(0, 10), 3)}T04:30:00.000Z`);
      }
      if (!c.institution_id) {
        add(`UNRESOLVED:${c.id}`, 'UNRESOLVED_INSTITUTION', 'info', c,
          `${c.case_no}: institution not yet identified`, `Reference "${c.institution_name_raw || c.aicte_id_raw}" needs confirmation so overlaps can be detected.`, c.created_at);
      }
    }

    for (const g of this.overlapGroups()) {
      if (g.status !== 'open') continue;
      add(`OVERLAP:${g.institution_id}:${g.signature}`, 'OVERLAP', g.severity === 'warning' ? 'serious' : g.severity, { id: null, institution_id: g.institution_id, region_code: g.institution?.region_code },
        `Potential Overlapping Cases – Coordination Required: ${g.institution?.name}`, g.reasons.join('. ') + '.', `${g.since}T05:00:00.000Z`, g.bureaus);
    }

    for (const p of this.duplicatePairs()) {
      if (p.linked || !p.crossBureau && !p.sameComplainant) continue;
      add(`DUPLICATE:${p.key}`, 'DUPLICATE', 'warning', { id: p.b.id, institution_id: p.institution.id, region_code: null },
        `Possible duplicate: ${p.a.case_no} ↔ ${p.b.case_no}`, p.reasons.join('. ') + '.', `${p.b.received_on}T05:30:00.000Z`, [...new Set([p.a.bureau_code, p.b.bureau_code])]);
    }

    // Auto-resolve alerts whose condition no longer holds.
    const now = nowIso();
    db.prepare(`UPDATE alerts SET resolved_at = ? WHERE resolved_at IS NULL AND type IN ('SLA_BREACH','SLA_APPROACHING','PENDING_REMINDER','ESCALATION','UNRESOLVED_INSTITUTION','TRANSFER_IN')
      AND case_id IN (SELECT id FROM cases WHERE status = 'Disposed')`).run(now);
    db.prepare(`UPDATE alerts SET resolved_at = ? WHERE resolved_at IS NULL AND type = 'UNRESOLVED_INSTITUTION'
      AND case_id IN (SELECT id FROM cases WHERE institution_id IS NOT NULL)`).run(now);
    db.prepare(`UPDATE alerts SET resolved_at = ? WHERE resolved_at IS NULL AND type = 'PENDING_REMINDER'
      AND EXISTS (SELECT 1 FROM cases c WHERE c.id = alerts.case_id AND substr(alerts.dedupe_key, length(alerts.dedupe_key) - 9) < substr(COALESCE(c.last_action_on, c.received_on), 1, 10))`).run(now);
    const openKeys = new Set(this.overlapGroups().filter((g) => g.status === 'open').map((g) => `OVERLAP:${g.institution_id}:${g.signature}`));
    for (const a of db.prepare(`SELECT id, dedupe_key FROM alerts WHERE type = 'OVERLAP' AND resolved_at IS NULL`).all()) {
      if (!openKeys.has(a.dedupe_key)) db.prepare('UPDATE alerts SET resolved_at = ? WHERE id = ?').run(now, a.id);
    }
    if (created && emit) bus.emit('event', { type: 'alerts.new', count: created });
    return created;
  }

  // Alerts that a one-off event raises (not derivable from state later).
  raiseEventAlert({ key, type, severity, caseRow, title, message, bureaus }) {
    this.db.prepare(`INSERT INTO alerts (dedupe_key, type, severity, case_id, institution_id, bureau_code, region_code, title, message, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`).run(
      key, type, severity, caseRow.id, caseRow.institution_id ?? null, `,${bureaus.join(',')},`, caseRow.region_code ?? null, title, message, nowIso());
  }
}
