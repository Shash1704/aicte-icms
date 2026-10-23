import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstitutionMatcher, TextIndex, normalizeAicteId, tokenizeName, jaroWinkler, acronymOf } from '../src/matching.js';
import { classifyComplaint } from '../src/classifier.js';

const INSTITUTIONS = [
  { id: 1, aicte_id: '1-5779170164', name: 'Aryabhatta Institute of Engineering & Technology', aliases: '["Aryabhatta Engineering College"]', city: 'Nagpur', district: 'Nagpur', state: 'Maharashtra' },
  { id: 2, aicte_id: '1-2985613461', name: 'Pragati College of Engineering', aliases: '[]', city: 'Nagpur', district: 'Nagpur', state: 'Maharashtra' },
  { id: 3, aicte_id: '1-4419927731', name: 'Pragati College of Engineering', aliases: '[]', city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana' },
  { id: 4, aicte_id: '1-7520008954', name: 'Sahyadri Polytechnic', aliases: '[]', city: 'Pune', district: 'Pune', state: 'Maharashtra' },
  { id: 5, aicte_id: '1-1234567890', name: 'Kautilya Institute of Management Studies', aliases: '[]', city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan' },
];
const m = new InstitutionMatcher(INSTITUTIONS);
const top = (q) => InstitutionMatcher.decide(m.match(q));

test('AICTE ID normalisation accepts common formats', () => {
  assert.equal(normalizeAicteId('1-5779170164'), '1-5779170164');
  assert.equal(normalizeAicteId(' 1 5779170164 '), '1-5779170164');
  assert.equal(normalizeAicteId('15779170164'), '1-5779170164');
  assert.equal(normalizeAicteId(''), '');
});

test('name tokenizer expands abbreviations and drops stopwords', () => {
  assert.deepEqual(tokenizeName('Aryabhatta Inst. of Engg & Tech'), ['aryabhatta', 'institute', 'engineering', 'technology']);
  assert.equal(acronymOf('Aryabhatta Institute of Engineering & Technology'), 'aiet');
  assert.ok(jaroWinkler('aryabhatta', 'aryabhata') > 0.95);
});

test('exact AICTE ID resolves automatically', () => {
  const d = top({ aicteId: '1-5779170164', name: 'something else' });
  assert.equal(d.decision, 'auto');
  assert.equal(d.institution.id, 1);
  assert.equal(d.method, 'aicte-id');
});

test('abbreviated and misspelt names resolve to the right institution', () => {
  for (const name of ['Aryabhata Inst of Engg and Tech, Nagpur', 'aryabhatta institute of engineering technology', 'Aryabhatta Engineering College']) {
    const d = top({ name });
    assert.notEqual(d.decision, 'unresolved', name);
    assert.equal(d.institution.id, 1, name);
  }
});

test('acronym with city resolves', () => {
  const d = top({ name: 'AIET, Nagpur' });
  assert.equal(d.institution.id, 1);
  assert.equal(d.method, 'acronym');
});

test('same name in two cities: city decides, no city asks for review', () => {
  assert.equal(top({ name: 'Pragati College of Engg', city: 'Hyderabad' }).institution.id, 3);
  assert.equal(top({ name: 'Pragati College of Engineering, Nagpur' }).institution.id, 2);
  assert.equal(top({ name: 'Pragati College of Engineering' }).decision, 'review');
});

test('unrelated names stay unresolved', () => {
  assert.equal(top({ name: 'Totally Different University of Arts' }).decision, 'unresolved');
});

test('text similarity finds the same grievance written differently, with readable terms', () => {
  const t = new TextIndex();
  t.add(1, 'Institute not refunding tuition fee of Rs 1,35,000 after I cancelled admission; original certificates withheld');
  t.add(2, 'My ward withdrew admission but the college refuses to refund the fee of Rs 1,35,000 and keeps original certificate');
  t.add(3, 'Ragging of first year students in hostel by seniors at night');
  const same = t.compare(1, 2), diff = t.compare(1, 3);
  assert.ok(same.score > 0.3, `same ${same.score}`);
  assert.ok(diff.score < 0.05, `diff ${diff.score}`);
  assert.ok(same.terms.includes('₹1,35,000'));
  assert.ok(same.terms.length >= 3);
  assert.ok(t.compare(1, 2).terms.every((w) => !/^rs\d/.test(w)), 'amounts are shown formatted');
});

test('classifier: ragging is critical and routed to the Anti-Ragging Cell', () => {
  const c = classifyComplaint('First year students are being ragged in the hostel by seniors; one student was injured');
  assert.equal(c.category, 'RAGGING');
  assert.equal(c.priority, 'Critical');
  assert.equal(c.suggestedBureau, 'ARC');
});

test('classifier: mixed grievance + regulatory complaint flags RB/PGRC coordination', () => {
  const c = classifyComplaint('Fee refund not given and faculty salary not paid for 4 months');
  assert.ok(['FEE_REFUND', 'SALARY'].includes(c.category));
  assert.ok(c.crossBureauHint);
});
