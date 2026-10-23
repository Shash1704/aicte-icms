// End-to-end API tests against a freshly seeded throwaway database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icms-test-'));
const PORT = 4300 + Math.floor(Math.random() * 500);
const base = `http://localhost:${PORT}/api`;
let proc;

async function call(method, url, token, body) {
  const res = await fetch(base + url, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
}
const login = async (u) => (await call('POST', '/auth/login', null, { username: u, password: 'Aicte@2026' })).body.token;

before(async () => {
  proc = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DB_PATH: path.join(dir, 'test.db'), UPLOAD_DIR: path.join(dir, 'uploads') }, stdio: 'pipe' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
});
after(() => { proc?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('auth: rejects bad credentials and unauthenticated calls', async () => {
  assert.equal((await call('POST', '/auth/login', null, { username: 'chairman', password: 'x' })).status, 401);
  assert.equal((await call('GET', '/cases')).status, 401);
});

test('dashboard returns all required KPIs', async () => {
  const t = await login('chairman');
  const { body } = await call('GET', '/dashboard', t);
  for (const k of ['received', 'pending', 'under_process', 'transferred', 'escalated', 'disposed', 'beyond_sla']) assert.equal(typeof body.kpis[k], 'number', k);
  assert.equal(body.trend.length, 12);
  assert.ok(body.bureaus.find((b) => b.code === 'RB'));
  assert.ok(body.overlaps.open > 0, 'seed has open overlaps');
});

test('registering a complaint on an institution handled elsewhere raises an overlap', async () => {
  const t = await login('chairman');
  const groups = (await call('GET', '/overlaps', t)).body;
  const inst = groups[0].institution;
  const other = ['FB', 'PAPB', 'AB', 'ARC', 'RB', 'PGRC'].find((b) => !groups[0].bureaus.includes(b));
  assert.ok(other, 'a Bureau not yet involved');
  const r = await call('POST', '/cases', t, {
    institution_name: inst.name.replace('Engineering', 'Engg').replace('Institute', 'Inst.'), city: inst.city,
    subject: 'Scholarship not received', description: 'My AICTE Pragati scholarship has not been verified by the institute.',
    category: 'SCHOLARSHIP', bureau_code: other,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.case.institution_id, inst.id, 'fuzzy name resolved to the institution');
  assert.ok(r.body.overlap, 'overlap returned');
  assert.ok(r.body.overlap.bureaus.includes(other));
  assert.ok(r.body.case.officer_id, 'auto-assigned');
});

test('workflow: transfer → accept → escalate → direction → dispose, with permissions', async () => {
  const pgrc = await login('pgrc.officer1');
  const rb = await login('rb.officer1');
  const admin = await login('chairman');
  const created = await call('POST', '/cases', pgrc, { institution_name: 'Unknown Test Institute', subject: 'Faculty not paid', description: 'Faculty salary not paid for months', category: 'SALARY' });
  const id = created.body.case.id;
  assert.equal(created.body.case.bureau_code, 'PGRC');
  assert.equal((await call('POST', `/cases/${id}/actions`, rb, { type: 'REPLY', remarks: 'x' })).status, 403, 'RB cannot act on a PGRC case');
  const tr = await call('POST', `/cases/${id}/actions`, pgrc, { type: 'TRANSFER', to_bureau: 'RB', remarks: 'Regulatory matter' });
  assert.equal(tr.body.status, 'Transferred');
  assert.equal(tr.body.bureau_code, 'RB');
  assert.equal((await call('POST', `/cases/${id}/actions`, rb, { type: 'SCN', remarks: 'x' })).status, 400, 'must accept transfer first');
  assert.equal((await call('POST', `/cases/${id}/actions`, rb, { type: 'ACCEPTED' })).body.status, 'Under Process');
  assert.equal((await call('POST', `/cases/${id}/actions`, rb, { type: 'ESCALATE', remarks: 'Non-compliance' })).body.status, 'Escalated');
  assert.equal((await call('POST', `/cases/${id}/actions`, rb, { type: 'DIRECTION', remarks: 'x' })).status, 403, 'officer cannot issue directions');
  assert.equal((await call('POST', `/cases/${id}/actions`, admin, { type: 'DIRECTION', remarks: 'Issue final notice' })).body.status, 'Under Process');
  assert.equal((await call('POST', `/cases/${id}/actions`, rb, { type: 'DISPOSE', remarks: 'done' })).status, 400, 'disposal type required');
  const d = await call('POST', `/cases/${id}/actions`, rb, { type: 'DISPOSE', remarks: 'Salaries paid', disposal_type: 'Resolved — relief provided' });
  assert.equal(d.body.status, 'Disposed');
  const detail = (await call('GET', `/cases/${id}`, rb)).body;
  const types = detail.actions.map((a) => a.action_type);
  for (const t of ['REGISTERED', 'TRANSFER', 'ACCEPTED', 'ESCALATE', 'DIRECTION', 'DISPOSE']) assert.ok(types.includes(t), t);
  const alerts = (await call('GET', '/alerts?state=all&limit=500', rb)).body.rows;
  assert.ok(alerts.some((a) => a.type === 'TRANSFER_IN' && a.case_id === id), 'transfer-in alert for RB');
});

test('regional officers only see their region', async () => {
  const t = await login('ro.sro');
  const { body } = await call('GET', '/cases?size=200', t);
  assert.ok(body.rows.length > 0);
  assert.ok(body.rows.every((r) => r.region_code === 'SRO'));
});

test('overlap coordination: designate a lead Bureau', async () => {
  const t = await login('chairman');
  const g = (await call('GET', '/overlaps?status=open', t)).body[0];
  const r = await call('POST', `/overlaps/${g.institution_id}/review`, t, { status: 'coordinated', lead_bureau: g.bureaus[0], note: 'test' });
  assert.equal(r.body.status, 'coordinated');
  assert.equal(r.body.lead_bureau, g.bureaus[0]);
});

test('every report type renders and exports CSV', async () => {
  const t = await login('chairman');
  for (const type of ['bureau', 'region', 'status', 'category', 'institution', 'ageing', 'disposal', 'overlaps', 'performance', 'officer']) {
    const r = await call('GET', `/reports/${type}`, t);
    assert.equal(r.status, 200, type);
    assert.ok(r.body.rows.length > 0, type);
    const csv = await call('GET', `/reports/${type}?format=csv`, t);
    assert.ok(String(csv.body).split('\n').length > 1, `${type} csv`);
  }
});

test('search filters work together', async () => {
  const t = await login('chairman');
  const r = (await call('GET', '/cases?bureau=PGRC&status=Disposed&from=2026-01-01&size=50', t)).body;
  assert.ok(r.rows.every((c) => c.bureau_code === 'PGRC' && c.status === 'Disposed' && c.received_on >= '2026-01-01'));
});
