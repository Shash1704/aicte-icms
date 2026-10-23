import crypto from 'node:crypto';
import { nowIso } from './dbutil.js';

let SECRET = process.env.ICMS_SECRET || crypto.randomBytes(32).toString('hex');
// Persisted secret (from the settings table) keeps sessions valid across restarts.
export function setSecret(s) { if (!process.env.ICMS_SECRET && s) SECRET = s; }
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // one working day

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

const b64 = (s) => Buffer.from(s).toString('base64url');
export function signToken(userId) {
  const payload = b64(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

export function makeAuth(db) {
  const getUser = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1');
  return function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    const data = verifyToken(token);
    const user = data && getUser.get(data.uid);
    if (!user) return res.status(401).json({ error: 'Not signed in or session expired' });
    req.user = publicUser(user);
    next();
  };
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not permitted for your role' });

export function makeAudit(db) {
  const ins = db.prepare('INSERT INTO audit_log (at, user_id, action, entity, entity_id, details, ip) VALUES (?,?,?,?,?,?,?)');
  return (user, action, entity, entityId, details, ip = null) =>
    ins.run(nowIso(), user?.id ?? null, action, entity ?? null, entityId ?? null, details ? JSON.stringify(details) : null, ip);
}

/** SQL fragment restricting what a user may see. Regional officers see their region only. */
export function scopeSql(user, alias = 'c') {
  if (user.role === 'regional') return { sql: `${alias}.region_code = ?`, params: [user.region_code] };
  return { sql: '1=1', params: [] };
}
