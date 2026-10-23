// Database schema and helpers that run anywhere (Node's sqlite or sql.js in the browser).

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS bureaus (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT
);
CREATE TABLE IF NOT EXISTS regions (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, office TEXT NOT NULL, states TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, sla_days INTEGER NOT NULL, default_bureau TEXT, default_priority TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  designation TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','head','officer','regional')),
  bureau_code TEXT REFERENCES bureaus(code),
  region_code TEXT REFERENCES regions(code),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS institutions (
  id INTEGER PRIMARY KEY,
  aicte_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  type TEXT, ownership TEXT,
  address TEXT, city TEXT, district TEXT, state TEXT, pincode TEXT,
  region_code TEXT REFERENCES regions(code),
  established INTEGER, approved_intake INTEGER,
  approval_status TEXT,
  email TEXT, phone TEXT, head_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_inst_region ON institutions(region_code);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY,
  case_no TEXT UNIQUE NOT NULL,
  external_ref TEXT,
  source TEXT,
  received_on TEXT NOT NULL,
  origin_bureau TEXT NOT NULL REFERENCES bureaus(code),
  bureau_code TEXT NOT NULL REFERENCES bureaus(code),
  officer_id INTEGER REFERENCES users(id),
  institution_id INTEGER REFERENCES institutions(id),
  institution_name_raw TEXT,
  aicte_id_raw TEXT,
  institution_city_raw TEXT,
  match_method TEXT,
  match_score REAL,
  region_code TEXT REFERENCES regions(code),
  complainant_name TEXT, complainant_type TEXT, complainant_email TEXT, complainant_phone TEXT,
  category TEXT NOT NULL REFERENCES categories(code),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Normal',
  status TEXT NOT NULL,
  last_action TEXT, last_action_on TEXT,
  next_action TEXT, next_action_due TEXT,
  expected_disposal TEXT NOT NULL,
  disposed_on TEXT, disposal_type TEXT, disposal_remarks TEXT,
  escalated_level INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_inst ON cases(institution_id);
CREATE INDEX IF NOT EXISTS idx_cases_bureau ON cases(bureau_code, status);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_received ON cases(received_on);
CREATE INDEX IF NOT EXISTS idx_cases_region ON cases(region_code);

CREATE TABLE IF NOT EXISTS case_actions (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  bureau_code TEXT,
  action_type TEXT NOT NULL,
  from_status TEXT, to_status TEXT,
  from_bureau TEXT, to_bureau TEXT,
  remarks TEXT,
  next_action TEXT, next_action_due TEXT
);
CREATE INDEX IF NOT EXISTS idx_actions_case ON case_actions(case_id, at);
CREATE INDEX IF NOT EXISTS idx_actions_at ON case_actions(at);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  action_id INTEGER REFERENCES case_actions(id),
  filename TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT, size INTEGER,
  uploaded_by INTEGER REFERENCES users(id), uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_links (
  id INTEGER PRIMARY KEY,
  case_a INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  case_b INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('overlap','duplicate','related')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (case_a, case_b)
);

-- Coordination state for an institution-level overlap (one row per institution).
CREATE TABLE IF NOT EXISTS overlap_reviews (
  institution_id INTEGER PRIMARY KEY REFERENCES institutions(id),
  status TEXT NOT NULL CHECK (status IN ('open','acknowledged','coordinated','dismissed')),
  lead_bureau TEXT REFERENCES bureaus(code),
  note TEXT,
  case_signature TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT
);

-- Pairs an officer marked "not a duplicate" so the engine stops flagging them.
CREATE TABLE IF NOT EXISTS dismissed_pairs (
  case_a INTEGER NOT NULL, case_b INTEGER NOT NULL,
  dismissed_by INTEGER, dismissed_at TEXT,
  PRIMARY KEY (case_a, case_b)
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  dedupe_key TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','serious','critical')),
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  institution_id INTEGER REFERENCES institutions(id),
  bureau_code TEXT, region_code TEXT,
  title TEXT NOT NULL, message TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
CREATE TABLE IF NOT EXISTS alert_reads (
  alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (alert_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT, entity_id TEXT,
  details TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`;

export function initSchema(db) {
  db.exec(SCHEMA);
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const nowIso = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (isoDate, n) => {
  const d = new Date(isoDate.length === 10 ? isoDate + 'T00:00:00Z' : isoDate);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) => {
  const da = new Date(a.slice(0, 10) + 'T00:00:00Z');
  const db = new Date(b.slice(0, 10) + 'T00:00:00Z');
  return Math.round((db - da) / 86400000);
};
