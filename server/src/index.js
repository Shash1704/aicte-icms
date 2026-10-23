import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, initSchema, DB_PATH } from './db.js';
import { Engine, bus } from './engine.js';
import { CaseService, HttpError } from './cases.js';
import { makeAudit, makeAuth, requireRole, setSecret } from './auth.js';
import { buildRouter } from './routes.js';
import { buildAnalytics } from './analytics.js';
import { Simulator } from './simulator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

if (!fs.existsSync(DB_PATH)) {
  console.log('No database found — generating demo data…');
  const { seed } = await import('./seed-cli.js');
  seed();
}

const db = openDb();
initSchema(db);
let secret = db.prepare("SELECT value FROM settings WHERE key = 'secret'").get()?.value;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('secret', ?)").run(secret);
}
setSecret(secret);

const engine = new Engine(db).init();
const audit = makeAudit(db);
const cases = new CaseService(db, engine, audit);
const simulator = new Simulator({ db, engine, cases });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- real-time stream (Server-Sent Events) ----------
const auth = makeAuth(db);
const clients = new Set();
app.get('/api/events', auth, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: hello\ndata: ${JSON.stringify({ user: req.user.username, simulator: simulator.running })}\n\n`);
  const client = { res, user: req.user };
  clients.add(client);
  req.on('close', () => clients.delete(client));
});
bus.on('event', (evt) => {
  const payload = `event: update\ndata: ${JSON.stringify({ ...evt, at: new Date().toISOString() })}\n\n`;
  for (const c of clients) c.res.write(payload);
});
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000).unref();

// ---------- simulator controls (admin) ----------
app.get('/api/simulator', auth, (_req, res) => res.json({ running: simulator.running, intervalMs: simulator.intervalMs }));
app.post('/api/simulator', auth, requireRole('admin'), (req, res) => {
  if (req.body?.running) simulator.start(Math.max(5000, Number(req.body.intervalMs) || 20000));
  else simulator.stop();
  audit(req.user, simulator.running ? 'simulator.start' : 'simulator.stop', 'system', null, null);
  bus.emit('event', { type: 'simulator', running: simulator.running, by: req.user.name });
  res.json({ running: simulator.running, intervalMs: simulator.intervalMs });
});
app.post('/api/simulator/tick', auth, requireRole('admin'), (_req, res) => { simulator.tick(); res.json({ ok: true }); });

app.use('/api', buildRouter({ db, engine, cases, audit }));
app.use('/api', makeAuth(db), buildAnalytics({ db, engine, audit }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- static frontend ----------
// Serves the built client (npm run build) if present; checked per request so build order doesn't matter.
const dist = path.resolve(here, '../../client/dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.use((req, res, next) => {
  const index = path.join(dist, 'index.html');
  if (req.method !== 'GET' || !fs.existsSync(index)) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(index);
});

// ---------- errors ----------
app.use((err, req, res, _next) => {
  const status = err instanceof HttpError ? err.status : err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

// Periodic sweep: SLA/pending alerts change with the calendar even when nobody acts.
setInterval(() => engine.refreshAlerts(), 60_000).unref();
engine.refreshAlerts({ emit: false });
if (process.env.SIMULATE === '1') simulator.start();

app.listen(PORT, () => {
  console.log(`AICTE ICMS server on http://localhost:${PORT}  (db: ${DB_PATH})`);
});
