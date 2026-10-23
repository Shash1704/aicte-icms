// Demo "live feed": periodically registers new complaints and moves existing cases forward,
// so the real-time dashboard, alerts and overlap detection can be shown working live.
import { TEMPLATES, COURSES, MONTHS, FIRST, LAST, fill, nameVariant } from './seed.js';
import { CATEGORIES, SOURCES } from './domain.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export class Simulator {
  constructor({ db, engine, cases }) {
    Object.assign(this, { db, engine, cases });
    this.timer = null;
    this.intervalMs = 20000;
  }
  get running() { return !!this.timer; }

  start(intervalMs = this.intervalMs) {
    this.stop();
    this.intervalMs = intervalMs;
    this.timer = setInterval(() => { try { this.tick(); } catch (e) { console.error('[simulator]', e.message); } }, intervalMs);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  tick() {
    if (Math.random() < 0.55) this.newComplaint();
    else this.advanceCase();
  }

  newComplaint() {
    // Bias toward institutions that already have active cases, so overlaps appear live.
    const hot = this.db.prepare(`SELECT institution_id AS id FROM cases WHERE status != 'Disposed' AND institution_id IS NOT NULL GROUP BY institution_id ORDER BY RANDOM() LIMIT 1`).get();
    const inst = this.engine.instById.get(Math.random() < 0.6 && hot ? hot.id : pick(this.engine.institutions).id);
    const cat = pick(CATEGORIES.filter((c) => c.code !== 'OTHER'));
    const tpl = TEMPLATES[cat.code];
    const vals = { course: pick(COURSES[inst.type] ?? COURSES.Engineering), amount: (ri(2, 30) * 5000).toLocaleString('en-IN'), n: ri(3, 40), month: pick(MONTHS) };
    const useId = Math.random() < 0.55;
    const aliasesArr = JSON.parse(inst.aliases || '[]');
    const acronym = inst.name.split(/\s+/).filter((w) => !['of', '&', 'and'].includes(w.toLowerCase())).map((w) => w[0]).join('');
    const variant = useId ? null : nameVariant({ ...inst, aliasesArr, acronym });
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const bureau = Math.random() < 0.25 && ['FACULTY_NORMS', 'INFRA', 'FEE_REFUND', 'CERTIFICATES'].includes(cat.code) ? (cat.bureau === 'RB' ? 'PGRC' : 'RB') : cat.bureau;
    const officer = this.db.prepare("SELECT * FROM users WHERE bureau_code = ? AND role IN ('officer','head') ORDER BY RANDOM() LIMIT 1").get(bureau === 'RO' ? 'RB' : bureau);
    this.cases.create({
      institution_name: useId ? inst.name : variant.text, aicte_id: useId ? inst.aicte_id : '', city: useId ? inst.city : '',
      subject: fill(pick(tpl.s), vals), description: fill(pick(tpl.d), { ...vals, inst: useId ? inst.name : variant.text.replace(/, .*$/, ''), city: inst.city }),
      category: cat.code, bureau_code: bureau, source: pick(SOURCES.slice(0, 5)),
      complainant_name: name, complainant_type: pick(['Student', 'Parent', 'Faculty']),
      complainant_email: `${name.toLowerCase().replace(/ /g, '.')}${ri(1, 99)}@mail.example.com`,
    }, officer ?? { id: null, role: 'admin', name: 'Portal intake' });
  }

  advanceCase() {
    const c = this.db.prepare(`SELECT * FROM cases WHERE status IN ('Pending','Under Process','Transferred') ORDER BY RANDOM() LIMIT 1`).get();
    if (!c) return;
    const actor = (c.officer_id && this.db.prepare('SELECT * FROM users WHERE id = ?').get(c.officer_id))
      || this.db.prepare("SELECT * FROM users WHERE bureau_code = ? AND role IN ('officer','regional','head') AND (region_code IS NULL OR region_code = ?) LIMIT 1").get(c.bureau_code, c.region_code)
      || this.db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
    let body;
    if (c.status === 'Transferred') body = { type: 'ACCEPTED', remarks: 'Transfer accepted.' };
    else if (c.status === 'Pending') body = { type: 'FORWARDED', remarks: 'Complaint forwarded to the institution for comments within 15 days.', next_action: "Await institution's comments" };
    else {
      const r = Math.random();
      body = r < 0.35 ? { type: 'REPLY', remarks: 'Reply received from the institution; under examination.', next_action: "Examine institution's reply" }
        : r < 0.5 ? { type: 'REMINDER', remarks: 'Reminder issued to the institution.' }
        : { type: 'DISPOSE', disposal_type: pick(['Resolved — relief provided', 'Closed — no merit', 'Action taken against institution']), remarks: 'Matter examined and disposed of.' };
    }
    this.cases.act(c.id, body, actor);
  }
}
