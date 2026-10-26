// Records the demo video: drives the live prototype in a browser, in time with the speakers' audio.
// Every action is pinned to the second (audio time) at which its line is spoken; the timings come from
// whisper word timestamps of audio/voice.wav (see README in this folder).
//   node record.mjs            → out/screen.webm + out/trim.txt (seconds to cut from the start)
//   FAST=1 node record.mjs     → dry run without waiting for the audio
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.DEMO_URL || 'https://shash1704.github.io/aicte-icms/';
const OUT = path.resolve('out');
const END = 164.6; // audio length (162.8 s) + a short hold on the last card
fs.mkdirSync(OUT, { recursive: true });

// The complaint typed in part 3 (same text as the demo script's "Text to paste").
const PASTE = {
  name: 'Malaygiri Clg of Engg & Research, Mangaluru',
  subject: 'Fee not refunded and certificates withheld',
  description: 'I cancelled my M.Tech admission but the college has not refunded the fee of Rs 1,35,000 and is withholding my original marksheet and transfer certificate. Faculty say they have not been paid salary for 3 months.',
  remark: 'Complaint forwarded to the Principal for comments within 15 days.',
  note: "RB to lead; PGRC to await the outcome of RB's action before acting.",
};

// ---------------- in-page helpers: cursor, highlight box, full-screen cards, part chip ----------------
const INIT = () => {
  const install = () => {
    if (document.getElementById('__cursor')) return;
    const st = document.createElement('style');
    st.textContent = `
      #__cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px)}
      #__cursor svg{filter:drop-shadow(0 2px 5px rgba(0,0,0,.7))}
      .__ripple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid #ececec;z-index:2147483646;pointer-events:none;animation:__rip .55s ease-out forwards}
      @keyframes __rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
      #__hl{position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #ececec;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.42),0 0 30px rgba(255,255,255,.25);opacity:0;transition:opacity .25s,left .35s,top .35s,width .35s,height .35s}
      #__card{position:fixed;inset:0;z-index:2147483640;background:radial-gradient(120% 90% at 50% 0%,#2c2c2f 0%,#121213 100%);color:#ececec;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .45s;pointer-events:none;font-family:"Jost Variable","Jost",system-ui,sans-serif}
      #__card.on{opacity:1}
      #__card .wrap{width:min(1180px,86vw)}
      #__card .eyebrow{font-size:14px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:#8a8a90}
      #__card h1{font-size:62px;line-height:1.08;font-weight:700;margin:20px 0 0;letter-spacing:.06em;text-transform:uppercase;text-shadow:0 8px 30px rgba(0,0,0,.6)}
      #__card .soft{color:#8a8a90}
      #__card p{font-size:24px;line-height:1.5;color:#b4b4b8;margin:24px 0 0;max-width:940px}
      #__card .tag{display:inline-block;border:1px solid rgba(255,255,255,.25);color:#ececec;font-weight:500;font-size:13px;letter-spacing:.22em;text-transform:uppercase;border-radius:4px;padding:8px 14px}
      #__card .tag.red{border-color:#f39090;color:#f39090}
      #__card ul{list-style:none;padding:0;margin:40px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:16px}
      #__card li{display:flex;gap:18px;align-items:center;background:linear-gradient(160deg,#28282b,#1f1f21);border:1px solid rgba(255,255,255,.06);box-shadow:0 24px 50px -28px rgba(0,0,0,.9);border-radius:10px;padding:22px 24px;font-size:23px;font-weight:500;opacity:0;transform:translateY(12px);transition:opacity .4s,transform .4s}
      #__card li.on{opacity:1;transform:none}
      #__card li .n{flex:none;font-size:14px;letter-spacing:.2em;color:#8a8a90}
      #__card .mark{font-size:22px;font-weight:700;letter-spacing:.2em;line-height:1.05}
      #__card .link{margin-top:30px;display:inline-block;background:#19191b;border:1px solid rgba(255,255,255,.08);box-shadow:0 18px 34px -14px rgba(0,0,0,.95);color:#ececec;font-size:32px;font-weight:600;letter-spacing:.06em;border-radius:6px;padding:18px 34px}
      #__chip{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483639;background:#19191b;color:#ececec;border:1px solid rgba(255,255,255,.1);box-shadow:0 14px 30px -12px rgba(0,0,0,.9);border-radius:6px;padding:9px 18px;font:500 13px "Jost Variable",system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;display:flex;align-items:center;gap:14px;opacity:0;transition:opacity .35s;pointer-events:none}
      #__chip b{color:#8a8a90;font-weight:500}
      html.__carding #__cursor{opacity:0}`;
    document.documentElement.appendChild(st);
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.4L9.8 20z" fill="#fff" stroke="#141414" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const pos = window.__pos || { x: innerWidth / 2, y: innerHeight / 2 };
    c.style.left = pos.x + 'px'; c.style.top = pos.y + 'px';
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; window.__pos = { x: e.clientX, y: e.clientY }; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = '__ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
    for (const id of ['__hl', '__card', '__chip']) { const d = document.createElement('div'); d.id = id; document.documentElement.appendChild(d); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.__install = install;
};

const MARK = '<div class="mark">IC<br>MS</div>';

// ---------------- runner ----------------
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const videoStart = Date.now();
page.setDefaultTimeout(20000);

let t0 = 0;
const now = () => (Date.now() - t0) / 1000;
const late = [];
const FAST = process.env.FAST === '1';
process.on('uncaughtException', async (e) => {
  console.error('FAILED:', e.message.split('\n')[0]);
  await page.screenshot({ path: path.join(OUT, 'fail.png') }).catch(() => {});
  process.exit(1);
});
process.on('unhandledRejection', async (e) => {
  console.error('FAILED:', String(e?.message ?? e).split('\n')[0]);
  await page.screenshot({ path: path.join(OUT, 'fail.png') }).catch(() => {});
  process.exit(1);
});
async function at(t, label) {
  if (FAST) { console.log(`${t.toFixed(1).padStart(6)}  ${label}`); return; }
  const wait = t - now();
  if (wait > 0) await page.waitForTimeout(wait * 1000);
  else if (wait < -0.4) late.push(`${label}: ${(-wait).toFixed(1)}s late`);
}
const sleep = (s) => page.waitForTimeout(s * 1000);
const ensure = () => page.evaluate(() => window.__install && window.__install());

async function moveTo(loc, steps = 18) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box for ' + loc);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  return b;
}
async function press(loc, steps = 16) {
  await ensure();
  await moveTo(loc, steps);
  await sleep(0.1);
  await loc.click({ timeout: 8000 });
}
async function highlight(loc, ms = 2600, pad = 8) {
  await ensure();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) return;
  await page.evaluate(([x, y, w, h, ms]) => {
    const el = document.getElementById('__hl');
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', opacity: '1' });
    clearTimeout(window.__hlT); window.__hlT = setTimeout(() => { el.style.opacity = '0'; }, ms);
  }, [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, ms]);
}
async function scrollTo(loc, block = 'center') {
  await loc.evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block);
  await sleep(0.7);
}
const scrollTop = () => page.evaluate(() => document.getElementById('main-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }));
async function chip(n, text) {
  await ensure();
  await page.evaluate(([n, text]) => {
    const el = document.getElementById('__chip');
    el.innerHTML = n ? `<b>.0${n}</b>${text}` : '';
    el.style.opacity = n ? '1' : '0';
  }, [n, text]);
}
async function card(html) {
  await ensure();
  await page.evaluate((html) => {
    const el = document.getElementById('__card');
    if (html === null) { el.classList.remove('on'); document.documentElement.classList.remove('__carding'); return; }
    document.documentElement.classList.add('__carding');
    el.innerHTML = `<div class="wrap">${html}</div>`;
    void el.offsetWidth;
    el.classList.add('on');
  }, html);
}
async function showItem(i) { await page.evaluate((i) => document.querySelectorAll('#__card li')[i]?.classList.add('on'), i); }
const nav = (label) => page.locator('aside nav a', { hasText: label }).first();
const cardSection = (title) => page.locator('section.glass', { has: page.locator('h2', { hasText: title }) }).first();
async function signInAs(text) {
  await press(page.locator('header button[aria-label="Account"]'), 14);
  await press(page.getByRole('button', { name: 'Sign out' }), 8);
  await press(page.locator('button', { hasText: text }).first(), 14);
}

// ---------------- warm-up (cut from the final video) ----------------
await page.goto(URL);
await page.locator('button', { hasText: 'Chairman (Competent Authority)' }).waitFor({ timeout: 120000 });
await ensure();
await page.mouse.move(1100, 470);
t0 = Date.now();
fs.writeFileSync(path.join(OUT, 'trim.txt'), String((t0 - videoStart) / 1000));

// ================= PART 1 · Opening and the problem (0:00–0:35) =================
await card(`${MARK}<div class="eyebrow" style="margin-top:30px">Smart India Hackathon 2026 · SIH26264 · AICTE</div>
  <h1>Integrated complaint<br>monitoring dashboard</h1>
  <p>Team Varangians</p>`);
await at(6.0, 'one screen');
await card(`${MARK}<h1 style="margin-top:28px">One screen for<br>every complaint<br><span class="soft">about a college</span></h1>`);
await at(15.0, 'live online');
await card(`${MARK}<h1 style="margin-top:28px">One screen for<br>every complaint<br><span class="soft">about a college</span></h1>
  <div class="link" style="font-size:24px;margin-top:34px">shash1704.github.io/aicte-icms</div>`);
await at(17.0, 'problem card');
await card(`<span class="tag red">The problem today</span>
  <h1>Complaints reach many departments</h1>
  <p>Regulation Bureau · Grievance Cell · Approval Bureau · Regional Offices …</p>
  <ul>
    <li><span class="n">.01</span>Each one keeps its own records</li>
    <li><span class="n">.02</span>Two departments on one college, unaware</li>
    <li><span class="n">.03</span>Double work and mixed messages</li>
    <li><span class="n">.04</span>Missed deadlines</li>
  </ul>`);
await at(24.3, 'p1'); await showItem(0);
await at(26.4, 'p2'); await showItem(1);
await at(31.9, 'p3'); await showItem(2);
await at(33.8, 'p4'); await showItem(3);
await at(34.9, 'to app');
await card(null);

// ================= PART 2 · The dashboard (0:35–1:01) =================
await at(35.4, 'sign in chairman');
await chip(1, 'The dashboard');
await press(page.locator('button', { hasText: 'Chairman (Competent Authority)' }).first(), 16);
const banner = page.locator('main a[href$="/overlaps"]', { hasText: 'Coordination required' }).first();
await banner.waitFor({ timeout: 30000 });
await at(37.2, 'big problem box');
await highlight(banner, 6200);
await moveTo(banner.locator('h2'), 18);
await at(40.6, '26 colleges');
await moveTo(banner.locator('span.tnum').first(), 14);
await at(44.0, 'needs attention');
const attention = cardSection('Needs attention');
await highlight(attention, 2400);
await moveTo(attention.locator('li a').first(), 16);
await at(46.1, 'click one');
await press(attention.locator('li a').first(), 8);
await page.locator('h2', { hasText: 'Case details' }).waitFor();
await highlight(cardSection('Case details'), 2200);
await at(48.7, 'back to dashboard');
await page.goBack();
await attention.waitFor();
await at(49.3, 'circle');
const ring = attention.locator('li a span[title$="days overdue"]').first();
await highlight(ring, 3800, 6);
await moveTo(ring, 14);
await at(54.0, 'further down');
await press(page.getByRole('button', { name: 'Show detailed statistics' }), 14);
const kpis = page.locator('div.glass', { hasText: 'Total received' }).first();
await kpis.waitFor();
await at(55.5, 'open and closed');
await scrollTo(kpis, 'center');
await highlight(kpis, 2700);
await moveTo(kpis.locator('a').nth(2), 14);
await at(58.2, 'how busy');
const workload = page.locator('div.glass', { hasText: 'net in 30 days' }).first();
await scrollTo(workload, 'center');
await highlight(workload, 2600);
await moveTo(workload, 14);

// ================= PART 3 · A messy complaint (1:01–1:39) =================
await at(61.0, 'new complaint');
await chip(2, 'A messy complaint');
await press(nav('Register complaint'), 16);
const nameInput = page.getByLabel('Institution name as written');
await nameInput.waitFor();
await at(63.2, 'type name');
await press(nameInput, 14);
await nameInput.pressSequentially(PASTE.name, { delay: 26 });
await at(64.8, 'look at name');
await highlight(nameInput, 3000, 6);
const identified = page.getByText('Institution identified').first().locator('xpath=ancestor::div[contains(@class,"mt-4")][1]');
await identified.waitFor({ timeout: 20000 });
await at(68.0, 'finds college');
await highlight(identified, 3800);
await moveTo(identified.locator('li').first(), 14);
await at(70.3, 'why');
await moveTo(identified.locator('li').first().locator('div.text-ink-2').first(), 12);
await at(71.3, 'paste complaint');
await page.getByLabel('Subject').first().fill(PASTE.subject);
await page.getByLabel('Description').first().fill(PASTE.description);
const suggest = page.getByText('Suggested classification').first().locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
await suggest.waitFor({ timeout: 20000 });
await scrollTo(suggest, 'center');
await at(72.6, 'suggests');
await highlight(suggest, 6000);
await moveTo(suggest.locator('b').nth(0), 14);
await at(74.9, 'urgent'); await moveTo(suggest.locator('b').nth(1), 10);
await at(76.3, 'department'); await moveTo(suggest.locator('b').nth(2), 10);
await at(78.3, 'warns');
const check = cardSection('Pre-registration check');
const warn = page.getByText('Potential Overlapping Cases – Coordination Required').first().locator('xpath=ancestor::div[contains(@class,"border")][1]');
await scrollTo(check, 'start');
await highlight(warn, 4600);
await moveTo(warn, 14);
await at(83.6, 'two older complaints');
const dups = check.locator('div', { has: page.locator('div', { hasText: /^Possible duplicates$/ }) }).last();
await highlight(dups, 2400);
await moveTo(dups.locator('li').first(), 12);
await at(85.4, 'save');
await press(page.getByRole('button', { name: 'Register complaint' }), 12);
await page.locator('h2', { hasText: 'Case details' }).waitFor({ timeout: 20000 });
await at(87.2, 'officer');
const officer = page.locator('dt', { hasText: 'Assigned officer' }).locator('xpath=..');
await highlight(officer, 2800, 8);
await moveTo(officer, 14);
await at(90.2, 'deadline');
const due = page.locator('dt', { hasText: 'Expected disposal date' }).locator('xpath=..');
await highlight(due, 2600, 8);
await moveTo(due, 12);
await at(93.4, 'forward to college');
const act = cardSection('Take action');
await scrollTo(act, 'center');
await act.locator('select').first().selectOption({ label: (await act.locator('select option', { hasText: 'Forwarded to institution' }).first().innerText()).trim() });
await press(act.locator('textarea'), 12);
await act.locator('textarea').pressSequentially(PASTE.remark, { delay: 8 });
await press(act.locator('button[type=submit]'), 10);
await at(96.2, 'history');
const history = cardSection('Workflow & action history');
await scrollTo(history, 'center');
await highlight(history, 3000);

// ================= PART 4 · One department leads (1:39–1:54) =================
await at(98.4, 'open coordination');
await chip(3, 'One department leads');
await scrollTop();
await sleep(0.5);
await press(page.getByRole('link', { name: /Open coordination/ }).first(), 14);
const firstGroup = page.locator('section[id^="inst-"]', { hasText: 'Malaygiri' }).first();
await firstGroup.waitFor();
// pin the card by id: the list re-sorts once the overlap is coordinated
const group = page.locator(`section#${await firstGroup.getAttribute('id')}`);
await scrollTo(group, 'start');
await at(100.2, 'both cases');
await highlight(group.locator('div.tile').first().locator('xpath=..'), 3800);
await at(102.3, 'one to lead');
await moveTo(group.getByRole('button', { name: 'Designate lead' }), 18);
await at(105.6, 'designate');
await press(group.getByRole('button', { name: 'Designate lead' }), 8);
const dlg = page.locator('[role=dialog]');
await dlg.waitFor();
await at(108.0, 'RB leads');
await dlg.getByLabel('Lead Bureau/Cell').selectOption({ label: 'Regulation Bureau' });
await highlight(dlg.getByLabel('Lead Bureau/Cell'), 1600, 6);
await at(109.1, 'PGRC waits');
await press(dlg.locator('textarea'), 10);
await dlg.locator('textarea').pressSequentially(PASTE.note, { delay: 10 });
await at(111.9, 'confirm');
await press(dlg.getByRole('button', { name: 'Confirm' }), 10);
await group.getByText(/Coordinated · lead RB/).first().waitFor();
await highlight(group.getByText(/Coordinated · lead RB/).first(), 2600, 6);
await moveTo(group.getByText(/Coordinated · lead RB/).first(), 12);

// ================= PART 5 · Live updates (1:54–2:03) =================
await at(114.4, 'admin');
await chip(4, 'Live updates');
await press(nav('Administration'), 16);
const gen = page.getByRole('button', { name: 'Generate one event' });
await gen.waitFor();
await at(116.4, 'event 1');
await press(gen, 12);
await sleep(1.1);
await press(gen, 4);
await at(118.0, 'everyone sees');
const toast = page.locator('[aria-live="polite"] > div').first();
await toast.waitFor({ timeout: 15000 }).catch(() => {});
await highlight(toast, 2400, 6).catch(() => {});
await moveTo(toast, 16).catch(() => {});
await at(120.6, 'alert');
await highlight(page.locator('header button[aria-label="Alerts"]'), 2200, 4);
await moveTo(page.locator('header button[aria-label="Alerts"]'), 14);

// ================= PART 6 · One college's history (2:03–2:19) =================
await at(122.8, 'pgrc officer');
await chip(5, "One college's history");
await signInAs('pgrc.officer1');
const search = page.locator('#global-search');
await search.waitFor();
await at(126.2, 'search');
await press(search, 12);
await search.pressSequentially('Malaygiri', { delay: 45 });
const hit = page.locator('button', { hasText: 'Malaygiri College of Engineering' }).first();
await hit.waitFor();
await press(hit, 10);
const tl = cardSection('Cross-Bureau/Cell timeline');
await tl.waitFor();
await at(128.3, 'timeline');
await scrollTo(tl, 'center');
await highlight(tl, 4400);
await moveTo(tl.locator('svg').first(), 16);
await at(132.6, 'RB case');
const all = cardSection('All complaints');
await scrollTo(all, 'start');
const rbRow = all.locator('tbody tr', { hasText: 'Refund of tuition fee' }).filter({ hasText: 'RB' }).first();
await press(rbRow.locator('a').first(), 14);
const coord = cardSection('Coordinate');
await coord.waitFor();
await at(134.6, "can't change");
await scrollTo(coord, 'center');
await highlight(coord, 4000);
await at(137.0, 'leave a note');
await moveTo(coord.locator('textarea'), 14);
await highlight(coord.locator('textarea'), 1800, 6);

// ================= PART 7 · Reports (2:19–2:28) =================
await at(138.6, 'reports');
await chip(6, 'Reports');
await press(nav('Reports'), 16);
const tab = (name) => page.getByRole('tab', { name });
await tab('Bureau/Cell-wise').waitFor();
await at(139.6, 'ten reports');
await highlight(page.locator('[role=tablist]').first(), 2200, 6);
await at(141.8, 'by department'); await press(tab('Bureau/Cell-wise'), 10);
await at(142.8, 'by region'); await press(tab('Region-wise'), 10);
await at(143.7, 'pending long'); await press(tab('Pending ageing'), 10);
await at(146.0, 'download');
await highlight(page.getByRole('button', { name: 'Export CSV' }), 1800, 6);
await press(page.getByRole('button', { name: 'Export CSV' }), 14);

// ================= PART 8 · Close (2:28–2:43) =================
await at(147.9, 'closing card');
await chip(0, '');
await card(`${MARK}<h1 style="margin-top:24px;font-size:52px">In short</h1>
  <ul>
    <li><span class="n">.01</span>One record for every college</li>
    <li><span class="n">.02</span>Clashes caught early</li>
    <li><span class="n">.03</span>Every decision saved</li>
    <li><span class="n">.04</span>Runs inside AICTE · no outside AI service</li>
  </ul>`);
await at(148.8, 'c1'); await showItem(0);
await at(150.6, 'c2'); await showItem(1);
await at(152.3, 'c3'); await showItem(2);
await at(154.3, 'c4'); await showItem(3);
await at(159.8, 'link card');
await card(`${MARK}<div class="eyebrow" style="margin-top:30px">Try it live — it runs in your browser</div>
  <div class="link">shash1704.github.io/aicte-icms</div>
  <p>Team Varangians · SIH 2026 · SIH26264 · AICTE</p>`);
await at(END, 'end');

await ctx.close();
await browser.close();
const webm = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm') && f !== 'screen.webm').map((f) => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!FAST) fs.renameSync(webm, path.join(OUT, 'screen.webm'));
console.log(late.length ? 'LATE STEPS:\n' + late.join('\n') : 'All steps on time');
