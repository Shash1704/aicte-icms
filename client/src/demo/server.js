// The ICMS server, running inside the browser for the GitHub Pages demo.
// It mirrors server/src/index.js and reuses the real server modules unchanged (routes, analytics,
// matching, overlap engine, alerts, simulator, seed). Only the database (sql.js) and a few Node
// built-ins are swapped for browser equivalents (see vite.config.ts).
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import express from './shims/express.js';
import { setBlobSaver } from './shims/multer.js';
import { SqliteAdapter } from './sqlite-adapter.js';
import { loadSnapshot, saveSnapshot, clearSnapshots } from './persist.js';
import { makeAudit, makeAuth, requireRole, hashPassword } from './auth-browser.js';
import { Engine, bus } from '../../../server/src/engine.js';
import { CaseService, HttpError } from '../../../server/src/cases.js';
import { buildRouter } from '../../../server/src/routes.js';
import { buildAnalytics } from '../../../server/src/analytics.js';
import { Simulator } from '../../../server/src/simulator.js';
import { seedDatabase } from '../../../server/src/seed.js';

const SNAPSHOT_KEY = 'db-v1';
const statusListeners = new Set();
let lastStatus = 'Starting…';
const setStatus = (s) => { lastStatus = s; statusListeners.forEach((fn) => fn(s)); };
export const onStatus = (fn) => { statusListeners.add(fn); fn(lastStatus); return () => statusListeners.delete(fn); };
const paint = () => new Promise((r) => setTimeout(r, 30)); // let the loading screen update before heavy work

let instance;
export const getDemoServer = () => (instance ??= start());

async function start() {
  setStatus('Loading the database engine…');
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const snapshot = await loadSnapshot(SNAPSHOT_KEY);
  let db = null;
  if (snapshot) {
    try {
      db = new SqliteAdapter(SQL, snapshot);
      if (!db.prepare("SELECT value FROM settings WHERE key = 'seeded_at'").get()) db = null;
    } catch { db = null; }
  }
  if (!db) {
    setStatus('Generating 1,900+ demo complaints in your browser…');
    await paint();
    db = new SqliteAdapter(SQL);
    db.exec('CREATE TABLE IF NOT EXISTS demo_blobs (name TEXT PRIMARY KEY, mime TEXT, data BLOB);');
    const saveDoc = db.prepare('INSERT OR REPLACE INTO demo_blobs (name, mime, data) VALUES (?,?,?)');
    seedDatabase(db, { hashPassword, saveDocument: (name, bytes) => saveDoc.run(name, 'application/pdf', bytes) });
    await saveSnapshot(SNAPSHOT_KEY, db.export());
  }
  setStatus('Starting the monitoring engine…');
  await paint();
  db.exec('CREATE TABLE IF NOT EXISTS demo_blobs (name TEXT PRIMARY KEY, mime TEXT, data BLOB);');
  setBlobSaver((name, bytes, mime) => db.prepare('INSERT OR REPLACE INTO demo_blobs (name, mime, data) VALUES (?,?,?)').run(name, mime, bytes));

  const engine = new Engine(db).init();
  const audit = makeAudit(db);
  const cases = new CaseService(db, engine, audit);
  const simulator = new Simulator({ db, engine, cases });

  const app = express();
  const auth = makeAuth(db);
  app.get('/api/health', (_req, res) => res.json({ ok: true, demo: true, time: new Date().toISOString() }));
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
  app.use((err, _req, res, _next) => { // eslint-disable-line no-unused-vars
    const status = err instanceof HttpError ? err.status : err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal error' : err.message });
  });

  // Same periodic sweep as the real server; simulator events and edits are saved shortly after.
  setInterval(() => engine.refreshAlerts(), 60_000);
  engine.refreshAlerts({ emit: false });
  let saveTimer = null;
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveSnapshot(SNAPSHOT_KEY, db.export()), 2000); };
  bus.on('event', scheduleSave);

  setStatus('Ready');
  return { app, db, bus, simulator, scheduleSave };
}

function makeRes(db) {
  const res = {
    statusCode: 200, headers: {}, body: null, finished: false,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); return this; },
    writeHead(c, h = {}) { this.statusCode = c; for (const [k, v] of Object.entries(h)) this.setHeader(k, v); return this; },
    write() { return true; },
    json(o) { this.setHeader('content-type', 'application/json'); this.body = JSON.stringify(o); return this.end(); },
    send(d) { if (!this.headers['content-type']) this.setHeader('content-type', 'text/plain; charset=utf-8'); this.body = d; return this.end(); },
    sendFile(file) {
      const name = String(file).split('/').pop();
      const row = db.prepare('SELECT mime, data FROM demo_blobs WHERE name = ?').get(name);
      if (!row) return this.status(404).json({ error: 'File missing' });
      if (!this.headers['content-type']) this.setHeader('content-type', row.mime || 'application/octet-stream');
      this.body = row.data;
      return this.end();
    },
    end() { this.finished = true; this._done?.(); return this; },
  };
  return res;
}

/** fetch()-compatible entry point used by the client in demo mode. */
export async function demoFetch(input, init = {}) {
  const { app, db, scheduleSave } = await getDemoServer();
  const url = new URL(String(input), 'http://demo.local');
  const headers = {};
  for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
  const req = {
    method: (init.method || 'GET').toUpperCase(), url: url.pathname + url.search, path: url.pathname,
    query: Object.fromEntries(url.searchParams), headers, params: {}, ip: '127.0.0.1', body: undefined, on() {},
  };
  if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
    req._form = init.body;
    req.body = Object.fromEntries([...init.body.entries()].filter(([, v]) => typeof v === 'string'));
  } else if (typeof init.body === 'string') {
    try { req.body = JSON.parse(init.body); } catch { req.body = init.body; }
  }
  const res = makeRes(db);
  await new Promise((resolve) => {
    res._done = resolve;
    app.handle(req, res, (err) => {
      if (res.finished) return;
      if (err) res.status(err.status || 500).json({ error: err.message || 'Error' });
      else res.status(404).json({ error: 'Not found' });
    });
  });
  if (req.method !== 'GET') scheduleSave();
  return new Response(res.body, { status: res.statusCode, headers: res.headers });
}

/** Live updates: the in-browser equivalent of the server's /api/events stream. */
export async function subscribeLive(fn) {
  const { bus: b, simulator } = await getDemoServer();
  const handler = (evt) => fn({ ...evt, at: new Date().toISOString() });
  b.on('event', handler);
  return { simulator: simulator.running, unsubscribe: () => b.off('event', handler) };
}

export async function resetDemoData() {
  await clearSnapshots();
  location.reload();
}
