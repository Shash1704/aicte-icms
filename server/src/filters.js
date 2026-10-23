// Builds a WHERE clause for cases from query-string filters (shared by list, dashboard, reports, export).
import { scopeSql } from './auth.js';
import { SLA_APPROACHING_DAYS } from './domain.js';

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

export function caseFilter(query, user, engine) {
  const where = [];
  const params = [];
  const scope = scopeSql(user, 'c');
  where.push(scope.sql);
  params.push(...scope.params);

  const inList = (col, values) => {
    if (!values.length) return;
    where.push(`${col} IN (${values.map(() => '?').join(',')})`);
    params.push(...values);
  };
  inList('c.bureau_code', list(query.bureau));
  inList('c.region_code', list(query.region));
  inList('c.category', list(query.category));
  inList('c.status', list(query.status));
  inList('c.priority', list(query.priority));
  inList('c.source', list(query.source));
  if (query.active === '1') where.push("c.status != 'Disposed'");

  const from = isoDate(query.from), to = isoDate(query.to);
  if (from) { where.push('c.received_on >= ?'); params.push(from); }
  if (to) { where.push('c.received_on <= ?'); params.push(to); }

  if (query.institution_id) { where.push('c.institution_id = ?'); params.push(Number(query.institution_id)); }
  if (query.officer === 'me') { where.push('c.officer_id = ?'); params.push(user.id); }
  else if (query.officer) { where.push('c.officer_id = ?'); params.push(Number(query.officer)); }
  if (query.unresolved === '1') where.push('c.institution_id IS NULL');

  if (query.aicte_id) { where.push('(i.aicte_id LIKE ? OR c.aicte_id_raw LIKE ?)'); params.push(`%${query.aicte_id}%`, `%${query.aicte_id}%`); }
  if (query.case_no) { where.push('c.case_no LIKE ?'); params.push(`%${query.case_no}%`); }
  if (query.institution) { where.push('(i.name LIKE ? OR c.institution_name_raw LIKE ?)'); params.push(`%${query.institution}%`, `%${query.institution}%`); }
  if (query.q) {
    const q = `%${String(query.q).trim()}%`;
    where.push(`(c.case_no LIKE ? OR i.name LIKE ? OR i.aicte_id LIKE ? OR c.institution_name_raw LIKE ? OR c.subject LIKE ? OR c.external_ref LIKE ? OR c.complainant_name LIKE ? OR i.city LIKE ?)`);
    params.push(q, q, q, q, q, q, q, q);
  }

  if (query.sla === 'breached') where.push("c.status != 'Disposed' AND c.expected_disposal < date('now')");
  else if (query.sla === 'approaching') { where.push(`c.status != 'Disposed' AND c.expected_disposal >= date('now') AND c.expected_disposal <= date('now', '+${SLA_APPROACHING_DAYS} days')`); }
  else if (query.sla === 'on-track') where.push(`c.status != 'Disposed' AND c.expected_disposal > date('now', '+${SLA_APPROACHING_DAYS} days')`);

  if (query.overlap === '1' && engine) {
    const ids = engine.overlapGroups().flatMap((g) => g.cases.map((c) => c.id));
    where.push(ids.length ? `c.id IN (${ids.join(',')})` : '0');
  }
  return { sql: where.join(' AND '), params };
}

export const CASE_LIST_SELECT = `
  SELECT c.id, c.case_no, c.received_on, c.origin_bureau, c.bureau_code, c.status, c.category, c.priority, c.subject, c.source,
         c.last_action, c.last_action_on, c.next_action, c.next_action_due, c.expected_disposal, c.disposed_on, c.region_code,
         c.institution_id, c.institution_name_raw, c.match_method, c.match_score, c.escalated_level,
         i.name AS institution_name, i.aicte_id, i.city, i.state,
         u.name AS officer_name, u.id AS officer_id,
         CAST(julianday(c.expected_disposal) - julianday(date('now')) AS INTEGER) AS days_left,
         CAST(julianday(COALESCE(substr(c.disposed_on,1,10), date('now'))) - julianday(c.received_on) AS INTEGER) AS age_days
  FROM cases c
  LEFT JOIN institutions i ON i.id = c.institution_id
  LEFT JOIN users u ON u.id = c.officer_id`;

export function toCsv(columns, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\r\n');
}
