// Rule-based complaint classifier: suggests category, priority and the Bureau/Cell that should
// handle a new complaint, with the keywords that triggered each suggestion (explainable).
import { categoryByCode } from './domain.js';

const RULES = [
  { cat: 'RAGGING', words: ['ragging', 'ragged', 'ragger', 'bullied by seniors', 'seniors forced', 'hostel seniors', 'intro session', 'anti-ragging', 'anti ragging'] },
  { cat: 'CERTIFICATES', words: ['original certificate', 'original documents', 'withheld', 'withholding', 'not returning', 'tc not', 'transfer certificate', 'marksheet', 'mark sheet', 'migration certificate', '10th and 12th'] },
  { cat: 'FEE_REFUND', words: ['refund', 'fee refund', 'excess fee', 'capitation', 'donation', 'cancelled admission', 'cancellation of admission', 'fees collected', 'extra fee', 'development fee'] },
  { cat: 'SALARY', words: ['salary', 'not paid', 'unpaid', 'wages', 'arrears', 'pf not deposited', 'provident fund'] },
  { cat: 'FACULTY_NORMS', words: ['faculty shortage', 'faculty ratio', 'pay scale', '7th pay', 'seventh pay', 'ad hoc faculty', 'unqualified faculty', 'ghost faculty', 'faculty not as per', 'cadre ratio'] },
  { cat: 'INFRA', words: ['infrastructure', 'laboratory', 'labs', 'library', 'classroom', 'hostel facility', 'no equipment', 'building', 'drinking water', 'toilet', 'land'] },
  { cat: 'UNAPPROVED', words: ['unapproved', 'not approved', 'fake approval', 'without approval', 'not recognised', 'not recognized', 'fake degree', 'unauthorised course', 'unauthorized course', 'off-campus'] },
  { cat: 'ADMISSION', words: ['excess intake', 'admitted beyond', 'admission irregular', 'merit list', 'management quota', 'seat blocking', 'lateral entry', 'admission denied', 'over intake'] },
  { cat: 'APPROVAL', words: ['closure', 'closing down', 'extension of approval', 'eoa', 'change of name', 'change of site', 'progressive closure', 'merger'] },
  { cat: 'HARASSMENT', words: ['harassment', 'harassed', 'discrimination', 'caste', 'sexual', 'threat', 'abuse', 'mental torture', 'humiliat'] },
  { cat: 'SCHOLARSHIP', words: ['scholarship', 'fellowship', 'pragati', 'saksham', 'gate stipend', 'pg scholarship', 'stipend', 'swanath'] },
  { cat: 'ACADEMIC', words: ['exam', 'examination', 'result', 'internship', 'syllabus', 'curriculum', 'attendance', 'detained', 'revaluation', 'academic calendar'] },
];

const URGENT = ['suicide', 'injured', 'hospital', 'assault', 'physical', 'threat to life', 'fir', 'police', 'minor', 'sexual'];

export function classifyComplaint(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const scored = RULES.map((r) => {
    const hits = r.words.filter((w) => t.includes(w));
    return { code: r.cat, hits, score: hits.reduce((s, w) => s + (w.includes(' ') ? 2 : 1), 0) };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const category = top ? top.code : 'OTHER';
  const cat = categoryByCode[category];
  const total = scored.reduce((s, r) => s + r.score, 0) || 1;
  const confidence = top ? Math.min(0.95, 0.45 + (top.score / total) * 0.5) : 0.2;

  const urgentHits = URGENT.filter((w) => t.includes(w));
  let priority = cat.priority;
  if (urgentHits.length) priority = 'Critical';
  else if (scored.length >= 3 && priority === 'Normal') priority = 'High';

  // A complaint touching both grievance and regulatory topics is a likely candidate for parallel
  // RB + PGRC action — flag it early so the receiving officer coordinates.
  const regulatory = scored.some((r) => ['UNAPPROVED', 'FACULTY_NORMS', 'INFRA', 'SALARY'].includes(r.code));
  const grievance = scored.some((r) => ['FEE_REFUND', 'CERTIFICATES', 'HARASSMENT'].includes(r.code));

  return {
    category,
    categoryName: cat.name,
    confidence: Number(confidence.toFixed(2)),
    keywords: top ? top.hits : [],
    alternatives: scored.slice(1, 3).map((r) => ({ category: r.code, name: categoryByCode[r.code].name, keywords: r.hits })),
    priority,
    priorityReason: urgentHits.length ? `Urgent terms: ${urgentHits.join(', ')}` : scored.length >= 3 ? 'Multiple issues raised' : `Default for ${cat.name}`,
    suggestedBureau: cat.bureau,
    crossBureauHint: regulatory && grievance ? 'Complaint raises both grievance and regulatory issues — RB and PGRC may both need to act. Coordinate before parallel action.' : null,
  };
}
