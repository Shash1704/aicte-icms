// Synthetic, realistic demo data. All institutions, people and complaints are fictional.
// Portable: runs on Node (see seed-cli.js, `npm run seed`) and in the browser (GitHub Pages demo).
import { initSchema, tx, addDays, daysBetween, today, nowIso } from './dbutil.js';
import { BUREAUS, REGIONS, CATEGORIES, categoryByCode, regionForState, DISPOSAL_TYPES, SOURCES, actionByCode } from './domain.js';
import { InstitutionMatcher } from './matching.js';
import { Engine } from './engine.js';
import { makePdf } from './pdf.js';

export const DEMO_PASSWORD = 'Aicte@2026';

// ---------- deterministic PRNG ----------
const DEFAULT_SEED = 20261022;
let _s = DEFAULT_SEED;
const rnd = () => { _s |= 0; _s = (_s + 0x6d2b79f5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const weighted = (pairs) => { const tot = pairs.reduce((s, [, w]) => s + w, 0); let r = rnd() * tot; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[pairs.length - 1][0]; };
const lognormal = (mu, sigma) => { const u = 1 - rnd(), v = rnd(); return Math.exp(mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); };

// ---------- reference lists ----------
const CITIES = {
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Noida', 'Ghaziabad', 'Agra', 'Varanasi', 'Prayagraj', 'Meerut'],
  Uttarakhand: ['Dehradun', 'Haridwar', 'Roorkee'], Bihar: ['Patna', 'Gaya', 'Muzaffarpur'],
  Punjab: ['Mohali', 'Ludhiana', 'Jalandhar', 'Amritsar'], Haryana: ['Gurugram', 'Faridabad', 'Sonipat', 'Kurukshetra', 'Hisar'],
  'Himachal Pradesh': ['Shimla', 'Solan', 'Hamirpur'], Delhi: ['New Delhi'], Rajasthan: ['Jaipur', 'Jodhpur', 'Kota', 'Udaipur', 'Bikaner'],
  'Jammu and Kashmir': ['Jammu', 'Srinagar'],
  Maharashtra: ['Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Navi Mumbai', 'Kolhapur', 'Amravati'], Goa: ['Margao'],
  Gujarat: ['Ahmedabad', 'Vadodara', 'Surat', 'Rajkot', 'Gandhinagar'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain'], Chhattisgarh: ['Raipur', 'Bhilai', 'Bilaspur'],
  'West Bengal': ['Kolkata', 'Durgapur', 'Siliguri', 'Howrah'], Odisha: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur'],
  Jharkhand: ['Ranchi', 'Jamshedpur', 'Dhanbad'], Assam: ['Guwahati', 'Jorhat'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore'], Puducherry: ['Puducherry'],
  Karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Belagavi', 'Hubballi', 'Tumakuru'], Kerala: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'],
  Telangana: ['Hyderabad', 'Warangal', 'Karimnagar', 'Khammam'], 'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Kakinada', 'Nellore'],
};
const STATE_WEIGHT = {
  'Tamil Nadu': 14, Maharashtra: 13, 'Andhra Pradesh': 11, Telangana: 9, 'Uttar Pradesh': 10, Karnataka: 8, Kerala: 5, 'Madhya Pradesh': 6,
  Rajasthan: 4, Gujarat: 5, Haryana: 4, Punjab: 4, 'West Bengal': 4, Odisha: 4, Chhattisgarh: 2, Jharkhand: 1.5, Bihar: 2, Uttarakhand: 1.5,
  'Himachal Pradesh': 1, Delhi: 1.5, 'Jammu and Kashmir': 1, Goa: 0.5, Assam: 1, Puducherry: 1,
};
const PINPREFIX = { 'Uttar Pradesh': '2', Uttarakhand: '24', Bihar: '8', Punjab: '14', Haryana: '12', 'Himachal Pradesh': '17', Delhi: '110', Rajasthan: '3', 'Jammu and Kashmir': '18', Maharashtra: '4', Goa: '403', Gujarat: '3', 'Madhya Pradesh': '4', Chhattisgarh: '49', 'West Bengal': '7', Odisha: '75', Jharkhand: '8', Assam: '78', 'Tamil Nadu': '6', Puducherry: '605', Karnataka: '5', Kerala: '6', Telangana: '50', 'Andhra Pradesh': '5' };

const PREFIXES = ['Aryabhatta', 'Vidyaprabha', 'Jnanadeep', 'Shikshadeep', 'Gyanodaya', 'Sumedha', 'Prajnapeeth', 'Medhavi', 'Tejaswini', 'Kaushalya',
  'Navachetana', 'Sudarshan', 'Bhaskaracharya', 'Varahamihira', 'Sushruta', 'Panini', 'Kautilya', 'Gargi', 'Maitreyi', 'Lilavati', 'Ramanujan',
  'Brahmagupta', 'Dhruva', 'Abhyudaya', 'Pragati', 'Unnati', 'Prerana', 'Sankalp', 'Samarth', 'Shreyas', 'Utkarsh', 'Vardhaman', 'Adarsh',
  'Akshara', 'Amrutha', 'Anantha', 'Bhavitha', 'Chaitanya', 'Deepthi', 'Ekalavya', 'Harshavardhan', 'Jyothirmayi', 'Kamadhenu', 'Lakshya', 'Mahima',
  'Nalanda', 'Pratibha', 'Rishikul', 'Sahyadri', 'Tapovan', 'Udayagiri', 'Vaishnavi', 'Zenith', 'Matrubhumi', 'Kalpataru', 'Sanskriti',
  'Swarnabharathi', 'Vikasa', 'Suryodaya', 'Chandrakala', 'Dhanvantari', 'Gurukul Kangri Vidyapeeth', 'Satyabodh', 'Vivekdeep', 'Shubhodaya', 'Arunachala',
  'Mahendragiri', 'Sindhudurg', 'Vindhyachal', 'Aravalli', 'Nilachal', 'Kanchanjunga', 'Malaygiri', 'Saptagiri', 'Tirumala Vidya'];

const PATTERNS = [
  ['Engineering', 26, ['{P} Institute of Engineering & Technology', '{P} College of Engineering', '{P} Institute of Technology', '{P} Engineering College', '{P} Institute of Technology & Management', '{P} College of Engineering & Research']],
  ['Management', 6, ['{P} Institute of Management Studies', '{P} School of Business Management', '{P} Institute of Management & Research']],
  ['Pharmacy', 5, ['{P} College of Pharmacy', '{P} Institute of Pharmaceutical Sciences']],
  ['Polytechnic', 5, ['{P} Polytechnic', '{P} Polytechnic College']],
  ['Computer Applications', 2, ['{P} Institute of Computer Applications']],
  ['Architecture', 2, ['{P} School of Architecture']],
];
const COURSES = {
  Engineering: ['B.Tech (Computer Science)', 'B.Tech (Electronics & Communication)', 'B.Tech (Mechanical)', 'B.Tech (Civil)', 'B.Tech (AI & Data Science)', 'M.Tech (VLSI Design)', 'B.Tech (Electrical)'],
  Management: ['MBA', 'PGDM', 'MBA (Finance)'], Pharmacy: ['B.Pharm', 'M.Pharm', 'Pharm.D'], Polytechnic: ['Diploma (Mechanical)', 'Diploma (Civil)', 'Diploma (Computer Engineering)'],
  'Computer Applications': ['MCA', 'BCA'], Architecture: ['B.Arch', 'M.Arch'],
};
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Karthik', 'Sai', 'Rahul', 'Aman', 'Nikhil', 'Pranav', 'Harsh', 'Vikram', 'Siddharth', 'Manoj', 'Suresh', 'Imran', 'Faizan', 'Joseph', 'Gurpreet',
  'Ananya', 'Diya', 'Priya', 'Sneha', 'Kavya', 'Pooja', 'Meera', 'Lakshmi', 'Divya', 'Neha', 'Shreya', 'Fatima', 'Ayesha', 'Riya', 'Harini', 'Swathi', 'Nandini', 'Tanvi', 'Ishita', 'Mary'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Patel', 'Reddy', 'Naidu', 'Iyer', 'Nair', 'Menon', 'Kumar', 'Singh', 'Yadav', 'Das', 'Mohanty', 'Patil', 'Deshmukh', 'Kulkarni', 'Joshi', 'Khan', 'Ansari',
  'Rao', 'Pillai', 'Chatterjee', 'Banerjee', 'Mishra', 'Tiwari', 'Pandey', 'Gowda', 'Hegde', 'Shetty', 'Bose', 'Sinha', 'Thomas', 'Fernandes', 'Kaur', 'Gill', 'Choudhary', 'Meena', 'Jain', 'Agarwal'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- complaint templates ----------
const T = {
  FEE_REFUND: {
    s: ['Non-refund of fees after cancellation of admission', 'Excess fee charged beyond FRC approved fee', 'Refund of tuition fee of Rs {amount} not processed', 'Capitation fee demanded for admission to {course}'],
    d: ['I took admission in {course} at {inst} in {month} and cancelled my admission before the cut-off date. The institute has not refunded the fee of Rs {amount} despite repeated requests and is deducting the full amount contrary to the AICTE refund policy.',
      '{inst} is charging Rs {amount} over and above the fee fixed by the Fee Regulatory Committee for {course} students. No receipts are being issued for the extra amount collected as development fee.',
      'My ward withdrew from {course} before the start of classes but {inst} refuses to refund the fee of Rs {amount}. They are also demanding fee for the remaining years as a condition for releasing documents.',
      'The management of {inst} demanded a donation of Rs {amount} for admission to {course} under management quota. Students who refused were denied admission.'],
  },
  CERTIFICATES: {
    s: ['Original certificates withheld by the institute', 'Institute not returning 10th and 12th marksheets', 'Transfer certificate and original documents not issued'],
    d: ['I left {course} at {inst} but the institute is withholding my original 10th, 12th and migration certificates and demanding Rs {amount} as fee for the remaining years.',
      '{inst} has retained the original documents of {n} students of {course} and refuses to return them, contrary to AICTE directions that original certificates must not be retained.',
      'I secured admission in another college through counselling but {inst} is not issuing my transfer certificate and original marksheets unless I pay Rs {amount}.'],
  },
  RAGGING: {
    s: ['Ragging of first year students in hostel', 'Complaint of ragging by senior students', 'Mental harassment and ragging by seniors'],
    d: ['First year {course} students of {inst} are being ragged in the hostel by senior students at night. Students are forced to perform humiliating acts and the warden has taken no action.',
      'My son, a first year student at {inst}, was ragged by seniors in the hostel and is now afraid to attend classes. The anti-ragging committee of the institute did not respond.',
      'Seniors at {inst} conduct so-called intro sessions where juniors of {course} are verbally abused and made to stand for hours. A complaint was also registered on the National Anti-Ragging Helpline.'],
  },
  HARASSMENT: {
    s: ['Harassment by Head of Department', 'Caste based discrimination in {course} department', 'Threat of failing students in internal assessment'],
    d: ['Students of {course} at {inst} are being harassed by the Head of Department who threatens to reduce internal marks if anyone complains about the facilities.',
      'Students from reserved categories in {course} at {inst} are facing discrimination in allotment of hostel and lab batches. Complaints to the principal were ignored.',
      'A faculty member at {inst} is mentally harassing girl students of {course}. The internal complaints committee has not acted on our written complaint.'],
  },
  FACULTY_NORMS: {
    s: ['Faculty not paid as per 7th Pay Commission', 'Shortage of qualified faculty in {course}', 'Ghost faculty shown in AICTE approval'],
    d: ['Faculty members of {inst} are paid far below the AICTE prescribed pay scales. The mandatory disclosure shows 7th pay scale salaries but actual payment is around Rs {amount} per month.',
      '{inst} does not have the required number of faculty for {course}. The faculty-student ratio is nearly 1:{n} and many faculty names on the AICTE portal never teach in the college.',
      'The institute has shown ghost faculty in its AICTE approval application. Several faculty listed for {course} have left {inst} but continue to be shown on the portal.'],
  },
  SALARY: {
    s: ['Non-payment of salary for {n} months', 'Salary and PF of staff not paid'],
    d: ['Teaching and non-teaching staff of {inst} have not been paid salary for the last {n} months. The management says there is no money though student fees are being collected.',
      'Provident fund deductions of staff at {inst} have not been deposited for {n} months and salaries are irregular. Several faculty of {course} have resigned due to non-payment.'],
  },
  INFRA: {
    s: ['Lack of laboratory and library facilities', 'Inadequate hostel and basic facilities', 'Institute functioning without required infrastructure'],
    d: ['The laboratories for {course} at {inst} do not have working equipment. Practicals are not conducted and the library has very few books, contrary to AICTE norms.',
      '{inst} is functioning from a rented building without the built-up area required by AICTE. There is no proper hostel, drinking water or toilet facilities for students.',
      'The computer lab at {inst} has only {n} working systems for over 300 students of {course}. Repeated requests to the management have been ignored.'],
  },
  UNAPPROVED: {
    s: ['Course run without AICTE approval', 'Fake AICTE approval letter shown to students', 'Off-campus centre not approved by AICTE'],
    d: ['{inst} is admitting students to {course}, which is not approved by AICTE for the current academic year. Students were shown an approval letter which appears to be fake.',
      'The institute is running an off-campus study centre at {city} for {course} without AICTE approval and collecting fees of Rs {amount} from students.',
      '{inst} advertised {course} as AICTE approved but the course does not appear in the approved list on the AICTE portal.'],
  },
  ADMISSION: {
    s: ['Admissions beyond approved intake', 'Irregularities in management quota admissions', 'Admissions made without counselling'],
    d: ['{inst} has admitted about {n} students over and above the approved intake in {course}. Extra students are shown against vacant seats of other branches.',
      'Management quota seats in {course} at {inst} were filled without a merit list and lateral entry admissions were made without counselling.',
      'Students admitted to {course} at {inst} in {month} were told their admission is provisional and they must pay Rs {amount} more to confirm the seat.'],
  },
  APPROVAL: {
    s: ['Course closed without notice to students', 'Change of site without AICTE approval'],
    d: ['{inst} has stopped classes for {course} and informed students that the course is being closed, though students are midway through their programme. No progressive closure approval is known.',
      '{inst} has shifted to a new location at {city} without approval for change of site from AICTE. Students of {course} have to travel 40 km.'],
  },
  SCHOLARSHIP: {
    s: ['AICTE Pragati scholarship not received', 'PG (GATE) scholarship not paid for {n} months', 'Saksham scholarship verification pending'],
    d: ['I was selected for the AICTE Pragati scholarship but have not received the amount. {inst} has not verified my application on the National Scholarship Portal.',
      'M.Tech students of {inst} have not received the GATE/PG scholarship for {n} months. The institute says it is pending at AICTE.',
      'My Saksham scholarship application is pending institute-level verification at {inst} for {n} months, and the portal is about to close.'],
  },
  ACADEMIC: {
    s: ['Results withheld by the institute', 'Mandatory internship not arranged', 'Students detained for attendance without notice'],
    d: ['{inst} has withheld the results of {n} students of {course} for non-payment of fees, which is causing loss of placement opportunities.',
      'The mandatory internship for {course} students at {inst} is not being arranged and students are asked to pay Rs {amount} for an internship certificate.',
      '{n} students of {course} at {inst} were detained for shortage of attendance without any prior notice or display of attendance records.'],
  },
  OTHER: {
    s: ['Misuse of AICTE logo in advertisements', 'Misleading placement claims'],
    d: ['{inst} is using the AICTE logo on its advertisements and certificates in a misleading manner.',
      '{inst} advertises 100% placement for {course} but students report that no placement drives were conducted in {month}.'],
  },
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

const REPLY_LINES = [
  'The institution has submitted its reply stating that the matter is being resolved and enclosed supporting documents.',
  'The institution denied the allegations and stated that the complainant has not completed the required formalities.',
  'The institution has stated that the fee was refunded partially and the balance will be paid within 30 days.',
  'Reply received; institution claims compliance with AICTE norms. Documents enclosed are incomplete.',
  'Institution has returned the original certificates to the complainant, as per its reply.',
  'Institution has sought additional time of 15 days to submit a detailed reply.',
];
const DISPOSAL_REMARKS = {
  'Resolved — relief provided': 'Complainant has confirmed receipt of relief. Case disposed.',
  'Action taken against institution': 'Institution directed to comply; compliance report received and accepted. Case disposed.',
  'Penalty / restriction imposed': 'With approval of the Competent Authority, admissions restricted (no admission) for the next academic year. Case disposed.',
  'Closed — no merit': 'Allegations not substantiated on examination of the reply and records. Case closed.',
  'Closed — outside AICTE purview': 'Matter pertains to the affiliating university / state government. Complainant informed accordingly.',
  'Withdrawn by complainant': 'Complainant has withdrawn the complaint in writing.',
  'Merged with related case': 'Case merged with the related case on the same issue for consolidated action.',
};
const NEXT = {
  REGISTERED: ['Examine complaint and forward to institution', 3], ASSIGNED: ['Examine complaint and forward to institution', 3],
  FORWARDED: ["Await institution's comments", 15], REMINDER: ['Await reply to reminder', 7], REPLY: ["Examine institution's reply", 7],
  SCN: ['Await reply to show-cause notice', 15], HEARING: ['Place hearing outcome before Competent Authority', 10],
  INSPECTION: ['Examine expert visit report', 10], TRANSFER: ['Accept transfer and assign officer', 3], ACCEPTED: ['Examine transferred case', 5],
  ESCALATE: ['Await direction from Competent Authority', 7], DIRECTION: ['Implement direction of Competent Authority', 10],
  COORDINATION: ['Proceed as per coordination decision', 7],
};

// Variants of an institution's name as people actually write it.
function nameVariant(inst) {
  const n = inst.name;
  const kind = weighted([['abbr', 4], ['short', 2], ['misspell', 2], ['acronym', 1.5], ['alias', inst.aliasesArr.length ? 1.5 : 0], ['lower', 1]]);
  let v = n;
  if (kind === 'abbr') v = n.replace('Engineering', pick(['Engg', 'Engg.', 'Engineerng'])).replace('Institute', pick(['Inst.', 'Instt', 'Institue'])).replace('Technology', pick(['Tech', 'Tech.'])).replace('College', pick(['Clg', 'College', 'Colg'])).replace(' & ', pick([' and ', ' & ', ' ']));
  if (kind === 'short') v = n.replace(/ (&|and) [A-Za-z]+$/, '').replace(' of ', ' ').replace('Institute', 'Inst');
  if (kind === 'misspell') {
    const [first, ...rest] = n.split(' ');
    let f = first;
    if (/(.)\1/.test(f)) f = f.replace(/(.)\1/, '$1');
    else if (f.includes('a')) f = f.replace(/a(?!.*a)/, 'aa');
    else f = f.replace(/i/, 'ee');
    if (f === first) f = first.slice(0, -1) + (first.endsWith('a') ? 'aa' : 'a');
    v = [f, ...rest].join(' ');
  }
  if (kind === 'acronym') v = inst.acronym.toUpperCase();
  if (kind === 'alias') v = pick(inst.aliasesArr);
  if (kind === 'lower') v = n.toLowerCase().replace(/&/g, 'and');
  if (chance(0.6) || kind === 'acronym') v += `, ${inst.city}`;
  return { text: v, kind };
}

/**
 * Fill an empty database with demo data.
 * @param db           a node:sqlite-compatible database (prepare().get/all/run, exec)
 * @param opts.hashPassword  password hasher for the demo accounts
 * @param opts.saveDocument  (storedName, bytes) => void — where generated PDF letters go
 * @param opts.log           progress logger
 */
export function seedDatabase(db, { hashPassword, saveDocument = () => {}, log = () => {}, seed = DEFAULT_SEED } = {}) {
  _s = seed;
  initSchema(db);
  const TODAY = today();
  const t0 = Date.now();

  tx(db, () => {
    for (const b of BUREAUS) db.prepare('INSERT INTO bureaus (code, name, description) VALUES (?,?,?)').run(b.code, b.name, b.description);
    for (const r of REGIONS) db.prepare('INSERT INTO regions (code, name, office, states) VALUES (?,?,?,?)').run(r.code, r.name, r.office, JSON.stringify(r.states));
    for (const c of CATEGORIES) db.prepare('INSERT INTO categories (code, name, sla_days, default_bureau, default_priority) VALUES (?,?,?,?,?)').run(c.code, c.name, c.sla, c.bureau, c.priority);
  });

  // ---------- users ----------
  const pw = hashPassword(DEMO_PASSWORD);
  const usedNames = new Set();
  const personName = () => { let n; do n = `${pick(FIRST)} ${pick(LAST)}`; while (usedNames.has(n)); usedNames.add(n); return n; };
  const users = [];
  const addUser = (username, role, bureau, region, designation, name = personName()) => {
    const r = db.prepare('INSERT INTO users (username, name, designation, email, role, bureau_code, region_code, password_hash) VALUES (?,?,?,?,?,?,?,?)')
      .run(username, name, designation, `${username.replace(/\./g, '_')}@aicte.example.in`, role, bureau, region, pw);
    const u = { id: Number(r.lastInsertRowid), username, name, role, bureau_code: bureau, region_code: region };
    users.push(u);
    return u;
  };
  addUser('chairman', 'admin', null, null, 'Chairman (Competent Authority)', 'Prof. Raghavendra Menon');
  addUser('ms', 'admin', null, null, 'Member Secretary', 'Dr. Sunita Rathore');
  const OFFICERS = { RB: 4, PGRC: 4, AB: 2, ARC: 2, FB: 2, PAPB: 2 };
  for (const [b, n] of Object.entries(OFFICERS)) {
    addUser(`${b.toLowerCase()}.head`, 'head', b, null, b === 'PGRC' ? 'Director, PGRC' : `Adviser, ${BUREAUS.find((x) => x.code === b).name}`);
    for (let i = 1; i <= n; i++) addUser(`${b.toLowerCase()}.officer${i}`, 'officer', b, null, pick(['Deputy Director', 'Assistant Director', 'Assistant Director', 'Section Officer']));
  }
  for (const r of REGIONS) addUser(`ro.${r.code.toLowerCase()}`, 'regional', 'RO', r.code, `Regional Officer, ${r.office}`);
  const officersOf = (b, region) => users.filter((u) => u.bureau_code === b && (u.role === 'officer' || u.role === 'regional') && (b !== 'RO' || u.region_code === region));
  const headOf = (b) => users.find((u) => u.role === 'head' && u.bureau_code === b) ?? users[0];
  const admins = users.filter((u) => u.role === 'admin');

  // ---------- institutions ----------
  const institutions = [];
  const usedIds = new Set();
  const stateList = Object.entries(STATE_WEIGHT);
  const usedNameCity = new Set();
  const N_INST = 240;
  for (let i = 0; i < N_INST; i++) {
    const state = weighted(stateList);
    const city = pick(CITIES[state]);
    const [type, , pats] = weighted(PATTERNS.map((p) => [p, p[1]]));
    let name;
    // ~8% deliberately share a name with an institution elsewhere (tests location disambiguation)
    if (i > 40 && chance(0.08)) {
      const twin = pick(institutions.filter((x) => x.type === type));
      if (twin && twin.city !== city) name = twin.name;
    }
    for (let tries = 0; !name || usedNameCity.has(name + city); tries++) name = fill(pick(pats), { P: pick(PREFIXES) });
    usedNameCity.add(name + city);
    let aid; do aid = `1-${ri(1, 9)}${String(ri(0, 999999999)).padStart(ri(6, 9), '0')}`; while (usedIds.has(aid)); usedIds.add(aid);
    const aliasesArr = [];
    if (chance(0.15)) {
      const p = name.split(' ')[0];
      const alt = fill(pick(pats), { P: p });
      if (alt !== name) aliasesArr.push(alt);
    }
    const established = ri(1985, 2019);
    const ownership = weighted([['Private (Self-financing)', 78], ['Government', 10], ['Government-aided', 7], ['Deemed University', 5]]);
    const pin = (PINPREFIX[state] + String(ri(0, 999999))).slice(0, 6).padEnd(6, '0');
    const inst = {
      aicte_id: aid, name, aliasesArr, type, ownership, city, district: city, state, pincode: pin, region_code: regionForState(state),
      address: `${pick(['Survey No. ' + ri(10, 400), 'Plot No. ' + ri(1, 120), ri(1, 40) + ' km Milestone'])}, ${pick(['Ring Road', 'NH-' + ri(1, 66), 'Industrial Area', 'College Road', 'Bypass Road', 'Old Highway'])}`,
      established, approved_intake: type === 'Engineering' ? ri(4, 24) * 60 : ri(1, 6) * 60,
      approval_status: weighted([['Approved', 88], ['Approved (with conditions)', 7], ['Under show-cause', 3], ['No admission — current year', 2]]),
      head_name: `Dr. ${personName()}`, phone: `0${ri(100, 999)}-${ri(2000000, 2999999)}`,
    };
    inst.acronym = name.split(/\s+/).filter((w) => !['of', '&', 'and'].includes(w.toLowerCase())).map((w) => w[0]).join('');
    inst.email = `principal@${inst.acronym.toLowerCase()}${city.toLowerCase().replace(/\s/g, '')}.example.edu.in`;
    const r = db.prepare(`INSERT INTO institutions (aicte_id, name, aliases, type, ownership, address, city, district, state, pincode, region_code, established, approved_intake, approval_status, email, phone, head_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(aid, name, JSON.stringify(aliasesArr), type, ownership, inst.address, city, city, state, pin, inst.region_code, established, inst.approved_intake, inst.approval_status, inst.email, inst.phone, inst.head_name);
    inst.id = Number(r.lastInsertRowid);
    // Pareto: a minority of institutions attract most complaints
    inst.weight = chance(0.12) ? ri(6, 14) : chance(0.35) ? ri(2, 5) : 1;
    institutions.push(inst);
  }
  const matcher = new InstitutionMatcher(db.prepare('SELECT * FROM institutions').all());

  // ---------- cases ----------
  const instPairs = institutions.map((i) => [i, i.weight]);
  const catWeights = [['FEE_REFUND', 20], ['CERTIFICATES', 14], ['RAGGING', 4], ['HARASSMENT', 5], ['FACULTY_NORMS', 9], ['SALARY', 6], ['INFRA', 8], ['UNAPPROVED', 5], ['ADMISSION', 6], ['APPROVAL', 3], ['SCHOLARSHIP', 9], ['ACADEMIC', 8], ['OTHER', 3]];
  const PAIR_BUREAU = { PGRC: 'RB', RB: 'PGRC', ARC: 'PGRC', AB: 'RB', FB: 'PGRC', PAPB: 'PGRC', RO: 'RB' };
  const seqByPrefix = new Map();
  const caseNo = (bureau, date) => { const p = `AICTE/${bureau}/${date.slice(0, 4)}/`; const n = (seqByPrefix.get(p) || 0) + 1; seqByPrefix.set(p, n); return p + String(n).padStart(5, '0'); };

  const insCase = db.prepare(`INSERT INTO cases (case_no, external_ref, source, received_on, origin_bureau, bureau_code, officer_id, institution_id, institution_name_raw, aicte_id_raw, institution_city_raw,
    match_method, match_score, region_code, complainant_name, complainant_type, complainant_email, complainant_phone, category, subject, description, priority, status, last_action, last_action_on,
    next_action, next_action_due, expected_disposal, disposed_on, disposal_type, disposal_remarks, escalated_level, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insAction = db.prepare(`INSERT INTO case_actions (case_id, at, actor_id, bureau_code, action_type, from_status, to_status, from_bureau, to_bureau, remarks, next_action, next_action_due)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insDoc = db.prepare('INSERT INTO documents (case_id, action_id, filename, stored_name, mime, size, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?)');

  const NOW = Date.now();
  // Office-hours timestamp (10:00–17:30 IST) on the given date, never later than the present moment.
  const at = (date, hourFrac = rnd()) => {
    const d = new Date(date + 'T04:30:00Z');
    d.setUTCMinutes(d.getUTCMinutes() + Math.floor(hourFrac * 450));
    if (d.getTime() > NOW) d.setTime(NOW - Math.floor(rnd() * Math.max(1, Math.min(NOW - new Date(date + 'T00:00:00Z').getTime(), 4 * 3600e3))));
    return d.toISOString();
  };
  let docCount = 0;
  const stats = { cases: 0, paired: 0, unresolved: 0, review: 0, fuzzy: 0, wrong: 0, wrongExamples: [] };
  const created = [];

  function makeCase({ inst, category, bureau, received, vals, complainant, tmplIdx, source, pairedWith }) {
    const tpl = T[category];
    const sIdx = tmplIdx ?? ri(0, tpl.s.length - 1);
    const dIdx = tmplIdx ?? ri(0, tpl.d.length - 1);
    // How the complainant refers to the institution
    let nameRaw = inst.name, idRaw = inst.aicte_id, cityRaw = inst.city;
    const refMode = weighted([['id', 62], ['name', 26], ['typo-id', 4], ['none-city', 8]]);
    if (refMode !== 'id') {
      const v = nameVariant(inst);
      nameRaw = v.text;
      idRaw = refMode === 'typo-id' ? inst.aicte_id.slice(0, -2) + String(ri(10, 99)) : null;
      cityRaw = refMode === 'none-city' ? null : chance(0.7) ? inst.city : null;
    }
    const instText = refMode === 'id' ? inst.name : nameRaw.replace(/, .*$/, '');
    const subject = fill(tpl.s[sIdx % tpl.s.length], vals);
    const description = fill(tpl.d[dIdx % tpl.d.length], { ...vals, inst: instText, city: pick(CITIES[inst.state]) }) +
      (refMode === 'id' ? ` (AICTE Permanent ID: ${inst.aicte_id})` : '');
    const cands = matcher.match({ name: nameRaw, aicteId: idRaw, city: cityRaw });
    const dec = InstitutionMatcher.decide(cands);
    let institutionId = null, method = null, score = null;
    if (dec.decision === 'auto') {
      institutionId = dec.institution.id; method = dec.method; score = dec.score;
      if (method !== 'aicte-id') stats.fuzzy++;
      if (institutionId !== inst.id) { stats.wrong++; if (stats.wrongExamples.length < 8) stats.wrongExamples.push(`${nameRaw} | ${cityRaw} -> ${dec.institution.name}, ${dec.institution.city} (true: ${inst.name}, ${inst.city}) ${dec.score.toFixed(2)}`); }
    }
    else if (dec.decision === 'review') {
      // Older cases were confirmed manually by an officer; recent ones wait in the review queue.
      if (daysBetween(received, TODAY) > 75) { institutionId = inst.id; method = 'manual'; score = 1; } else { method = 'review'; score = dec.score; stats.review++; }
    } else if (daysBetween(received, TODAY) > 75) { institutionId = inst.id; method = 'manual'; score = 1; } else stats.unresolved++;
    const cat = categoryByCode[category];
    const priority = category === 'RAGGING' || chance(0.04) ? 'Critical' : chance(0.15) ? 'High' : cat.priority;
    const expected = addDays(received, cat.sla);

    // ----- simulate lifecycle -----
    const durationFactor = lognormal(Math.log(1.0), 0.6) * (chance(0.07) ? 4 : 1); // some cases get stuck
    const plannedEnd = addDays(received, Math.max(2, Math.round(cat.sla * Math.min(8, durationFactor))));
    const span = Math.max(2, daysBetween(received, plannedEnd));
    let curBureau = bureau;
    let officer = pick(officersOf(curBureau, inst.region_code));
    const steps = [];
    const push = (dayOffset, type, extra = {}) => steps.push({ date: addDays(received, Math.round(dayOffset)), type, ...extra });
    push(0, 'REGISTERED');
    push(rnd() < 0.7 ? 0 : 1, 'ASSIGNED');
    const transfer = chance(0.12) && !pairedWith;
    const transferAt = 1 + rnd() * Math.min(10, span * 0.3);
    const flow = curBureau === 'RB'
      ? ['FORWARDED', chance(0.3) && 'REMINDER', 'REPLY', chance(0.45) && 'SCN', chance(0.35) && 'HEARING', chance(0.25) && 'INSPECTION']
      : curBureau === 'ARC' ? ['FORWARDED', 'REPLY', chance(0.3) && 'INSPECTION']
      : ['FORWARDED', chance(0.4) && 'REMINDER', 'REPLY'];
    const middle = flow.filter(Boolean);
    let targetBureau = null;
    if (transfer) {
      targetBureau = { PGRC: pick(['RB', 'RB', 'ARC', 'FB', 'AB']), RB: pick(['RO', 'PGRC', 'AB']), AB: 'RB', ARC: 'PGRC', FB: 'PGRC', PAPB: 'PGRC', RO: 'RB' }[curBureau];
      push(transferAt, 'TRANSFER', { to: targetBureau });
      push(transferAt + (chance(0.15) ? ri(4, 9) : ri(1, 3)), 'ACCEPTED');
    }
    const startMid = transfer ? transferAt + 5 : 2;
    middle.forEach((m, i) => push(startMid + ((span - startMid) * (i + 1)) / (middle.length + 1.5) + rnd() * 2, m));
    if (chance(0.1)) push(startMid + rnd() * (span - startMid), 'COORDINATION');
    const overdue = daysBetween(expected, plannedEnd);
    if (overdue > 10 && chance(0.25)) {
      const e = daysBetween(received, expected) + ri(8, 20);
      push(e, 'ESCALATE');
      push(e + ri(5, 30), 'DIRECTION');
    }
    push(span, 'DISPOSE');
    steps.sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'REGISTERED' ? -1 : 0));
    // ensure DISPOSE is last and ordering consistent
    const di = steps.findIndex((s) => s.type === 'DISPOSE');
    const disp = steps.splice(di, 1)[0];
    const lastDate = steps[steps.length - 1].date;
    disp.date = disp.date < lastDate ? addDays(lastDate, 1) : disp.date;
    steps.push(disp);
    const live = steps.filter((s) => s.date <= TODAY && (s.date < TODAY || chance(0.5)));

    // derive state
    let status = 'Pending';
    let lastAction = null, lastActionOn = null, nextAction = null, nextDue = null, disposedOn = null, disposalType = null, disposalRemarks = null, escalated = 0;
    const actionRows = [];
    for (const s of live) {
      const ts = at(s.date);
      const from = status;
      let to = status, fromB = null, toB = null, remarks = null, actor = officer?.id ?? null;
      const actingBureau = curBureau;
      switch (s.type) {
        case 'REGISTERED': to = 'Pending'; remarks = `Received via ${source}.`; break;
        case 'ASSIGNED': remarks = `Assigned to ${officer.name}.`; break;
        case 'FORWARDED': to = 'Under Process'; remarks = `Complaint forwarded to the Principal/Director, ${inst.name}, for comments within 15 days vide letter F.No. ${curBureau}/${ri(100, 999)}/${s.date.slice(0, 4)}.`; break;
        case 'REMINDER': to = 'Under Process'; remarks = 'No reply received within the stipulated time. Reminder issued to the institution.'; break;
        case 'REPLY': to = 'Under Process'; remarks = pick(REPLY_LINES); break;
        case 'SCN': to = 'Under Process'; remarks = 'Show-cause notice issued to the institution under the AICTE Approval Process Handbook for violation of norms, seeking reply within 15 days.'; break;
        case 'HEARING': to = 'Under Process'; remarks = `Personal hearing held with the institution's representatives on ${s.date}. Institution sought time to submit compliance.`; break;
        case 'INSPECTION': to = 'Under Process'; remarks = 'Expert Visit Committee visited the institution; report received and placed on file.'; break;
        case 'COORDINATION': remarks = 'Matter discussed with the other Bureau/Cell handling complaints on this institution to avoid parallel action.'; break;
        case 'TRANSFER': to = 'Transferred'; fromB = curBureau; toB = s.to; remarks = `On examination, the matter falls within the purview of ${BUREAUS.find((b) => b.code === s.to).name}. Transferred for necessary action.`; curBureau = s.to; officer = pick(officersOf(curBureau, inst.region_code)); break;
        case 'ACCEPTED': to = 'Under Process'; remarks = `Transfer accepted by ${curBureau}; assigned to ${officer.name}.`; actor = officer.id; break;
        case 'ESCALATE': to = 'Escalated'; escalated++; remarks = 'Institution has not complied despite reminders and the case has crossed the prescribed timeline. Escalated to the Competent Authority for direction.'; actor = headOf(curBureau).id; break;
        case 'DIRECTION': to = 'Under Process'; remarks = pick(['Competent Authority directed issue of final notice to the institution.', 'Competent Authority directed an Expert Visit Committee to verify the facts.', 'Competent Authority directed the Bureau to dispose of the matter within 15 days.']); actor = pick(admins).id; break;
        case 'DISPOSE': {
          to = 'Disposed';
          disposalType = curBureau === 'RB' ? weighted([['Action taken against institution', 30], ['Penalty / restriction imposed', 8], ['Resolved — relief provided', 25], ['Closed — no merit', 25], ['Merged with related case', 4], ['Closed — outside AICTE purview', 8]])
            : weighted([['Resolved — relief provided', 45], ['Closed — no merit', 18], ['Closed — outside AICTE purview', 12], ['Withdrawn by complainant', 8], ['Action taken against institution', 12], ['Merged with related case', 5]]);
          disposalRemarks = DISPOSAL_REMARKS[disposalType]; remarks = disposalRemarks; disposedOn = ts; break;
        }
      }
      status = to;
      const def = actionByCode[s.type];
      const nx = NEXT[s.type];
      if (s.type !== 'DISPOSE') { if (nx) { nextAction = nx[0]; nextDue = addDays(s.date, nx[1]); } } else { nextAction = null; nextDue = null; }
      if (s.type !== 'ASSIGNED') { lastAction = def.label; lastActionOn = ts; }
      actionRows.push({ ts, actor, bureau: s.type === 'TRANSFER' ? fromB : actingBureau, type: s.type, from, to, fromB, toB, remarks, nextAction: s.type === 'DISPOSE' ? null : nextAction, nextDue: s.type === 'DISPOSE' ? null : nextDue });
    }
    if (status === 'Pending' && lastAction === null) { lastAction = 'Complaint registered'; lastActionOn = at(received); }
    const isTransferredPending = status === 'Transferred';
    const finalOfficer = isTransferredPending ? null : officer?.id ?? null;
    const no = caseNo(bureau, received);
    const createdAt = at(received, 0.1);
    const r = insCase.run(no, source.startsWith('CPGRAMS') ? `DARPG/E/${received.slice(0, 4)}/${ri(1000000, 9999999)}` : source.startsWith('Ministry') ? `MoE-${ri(10000, 99999)}` : null,
      source, received, bureau, curBureau, finalOfficer, institutionId, nameRaw, idRaw, cityRaw, method, score, institutionId ? inst.region_code : (cityRaw ? inst.region_code : null),
      complainant.name, complainant.type, complainant.email, complainant.phone, category, subject, description, priority, status, lastAction, lastActionOn,
      nextAction, nextDue, expected, disposedOn, disposalType, disposalRemarks, escalated, createdAt, lastActionOn ?? createdAt);
    const caseId = Number(r.lastInsertRowid);
    for (const a of actionRows) {
      const ar = insAction.run(caseId, a.ts, a.actor, a.bureau, a.type, a.from, a.to, a.fromB, a.toB, a.remarks, a.nextAction, a.nextDue);
      if (['FORWARDED', 'REPLY', 'SCN', 'INSPECTION'].includes(a.type) && chance(0.22)) {
        const title = { FORWARDED: 'Letter to institution', REPLY: 'Reply from institution', SCN: 'Show-cause notice', INSPECTION: 'Expert visit report' }[a.type];
        const stored = `seed-${caseId}-${Number(ar.lastInsertRowid)}.pdf`;
        const buf = makePdf([`ALL INDIA COUNCIL FOR TECHNICAL EDUCATION`, `${BUREAUS.find((b) => b.code === a.bureau)?.name ?? ''}`, '', `${title}`, `Case No: ${no}`, `Date: ${a.ts.slice(0, 10)}`, `Institution: ${inst.name} (${inst.aicte_id})`, '', ...wrap(a.remarks, 88), '', '(Synthetic demo document)']);
        saveDocument(stored, buf);
        insDoc.run(caseId, Number(ar.lastInsertRowid), `${title.replace(/ /g, '_')}_${no.replace(/\//g, '-')}.pdf`, stored, 'application/pdf', buf.length, a.actor, a.ts);
        docCount++;
      }
    }
    stats.cases++;
    const out = { id: caseId, no, inst, received, bureau, status, category };
    created.push(out);
    return out;
  }

  const complainantFor = (category, inst) => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const type = category === 'SALARY' || category === 'FACULTY_NORMS' ? weighted([['Faculty', 6], ['Non-teaching staff', 2], ['Anonymous', 1]])
      : category === 'UNAPPROVED' || category === 'APPROVAL' ? weighted([['Student', 4], ['Parent', 2], ['Public', 2], ['Ministry / Govt.', 1]])
      : weighted([['Student', 7], ['Parent', 3], ['Public', 1], ['Anonymous', 0.5]]);
    if (type === 'Anonymous') return { name: 'Anonymous', type, email: null, phone: null };
    return { name, type, email: `${name.toLowerCase().replace(/ /g, '.')}${ri(1, 99)}@mail.example.com`, phone: `9${ri(100000000, 999999999)}` };
  };

  const N_CASES = 1750;
  tx(db, () => {
    for (let i = 0; i < N_CASES; i++) {
      const inst = weighted(instPairs);
      const category = weighted(catWeights);
      const cat = categoryByCode[category];
      // received date: up to ~20 months back, denser in recent months
      const back = Math.floor(600 * Math.pow(rnd(), 1.25));
      const received = addDays(TODAY, -back);
      let bureau = cat.bureau;
      if (['FACULTY_NORMS', 'INFRA', 'SALARY', 'UNAPPROVED'].includes(category) && chance(0.3)) bureau = 'PGRC'; // grievances arrive at PGRC first
      if (category === 'INFRA' && chance(0.15)) bureau = 'RO';
      const source = bureau === 'ARC' ? 'National Anti-Ragging Helpline' : bureau === 'RO' ? weighted([['Suo-motu / inspection', 2], ['Regional Office referral', 3]])
        : weighted([['AICTE Grievance Portal', 40], ['CPGRAMS (DARPG)', 25], ['Email', 12], ['Post / Letter', 8], ['Ministry of Education reference', 8], ['Court directive', 2], ['Regional Office referral', 5]]);
      const course = pick(COURSES[inst.type]);
      const vals = { course, amount: (ri(2, 30) * 5000).toLocaleString('en-IN'), n: ri(3, 40), month: pick(MONTHS), year: received.slice(0, 4) };
      const complainant = complainantFor(category, inst);
      const c = makeCase({ inst, category, bureau, received, vals, complainant, source });

      // Same grievance reaching another Bureau/Cell (complainant writes to Ministry/CPGRAMS too).
      if (chance(0.1)) {
        const otherBureau = PAIR_BUREAU[bureau];
        const lag = ri(0, 40);
        const rec2 = addDays(received, lag);
        if (rec2 <= TODAY) {
          const sameComplainant = chance(0.55);
          makeCase({ inst, category, bureau: otherBureau, received: rec2, vals, complainant: sameComplainant ? complainant : complainantFor(category, inst),
            source: weighted([['Ministry of Education reference', 3], ['CPGRAMS (DARPG)', 3], ['Email', 1]]), pairedWith: c, tmplIdx: ri(0, 3) });
          stats.paired++;
        }
      }
    }
  });

  // ---------- links & overlap reviews to show workflow history ----------
  const engine = new Engine(db).init();
  tx(db, () => {
    const pairs = engine.duplicatePairs({ limit: 5000 });
    for (const p of pairs) {
      const older = p.a.received_on < p.b.received_on ? p.a : p.b;
      if (daysBetween(older.received_on, TODAY) > 60 && p.score > 0.5 && chance(0.6)) {
        const by = pick(officersOf(p.a.bureau_code === 'RO' ? 'RB' : p.a.bureau_code));
        const ts = at(addDays(p.b.received_on > p.a.received_on ? p.b.received_on : p.a.received_on, ri(2, 8)));
        if (ts.slice(0, 10) > TODAY) continue;
        db.prepare('INSERT OR IGNORE INTO case_links (case_a, case_b, link_type, note, created_by, created_at) VALUES (?,?,?,?,?,?)')
          .run(Math.min(p.a.id, p.b.id), Math.max(p.a.id, p.b.id), p.crossBureau ? 'overlap' : 'duplicate', 'Same grievance; linked for consolidated action.', by?.id ?? null, ts);
      }
    }
    const groups = engine.overlapGroups();
    groups.forEach((g, i) => {
      if (i % 3 === 1 || i % 7 === 0) {
        const lead = g.bureaus.includes('RB') ? 'RB' : g.bureaus[0];
        const status = i % 7 === 0 ? 'coordinated' : 'acknowledged';
        const by = headOf(lead);
        const ts = at(addDays(g.since, ri(1, 5)) > TODAY ? TODAY : addDays(g.since, ri(1, 5)));
        db.prepare('INSERT INTO overlap_reviews (institution_id, status, lead_bureau, note, case_signature, reviewed_by, reviewed_at) VALUES (?,?,?,?,?,?,?)')
          .run(g.institution_id, status, status === 'coordinated' ? lead : null, status === 'coordinated' ? `${lead} to lead; other Bureaus to await outcome before independent action.` : 'Noted. Bureaus informed to coordinate.', g.signature, by.id, ts);
        for (const c of g.cases) insAction.run(c.id, ts, by.id, by.bureau_code, 'COORDINATION', c.status, c.status, null, null, `Overlap ${status}${status === 'coordinated' ? ` — lead: ${lead}` : ''}.`, null, null);
      }
    });
    // Event alerts for recent transfers/escalations
    for (const a of db.prepare(`SELECT a.*, c.case_no, c.institution_id, c.region_code FROM case_actions a JOIN cases c ON c.id = a.case_id
      WHERE a.action_type IN ('TRANSFER','ESCALATE') AND a.at >= ?`).all(addDays(TODAY, -30))) {
      const isT = a.action_type === 'TRANSFER';
      db.prepare(`INSERT OR IGNORE INTO alerts (dedupe_key, type, severity, case_id, institution_id, bureau_code, region_code, title, message, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(`${isT ? 'TRANSFER_IN' : 'ESCALATED'}:${a.id}`, isT ? 'TRANSFER_IN' : 'ESCALATION', isT ? 'info' : 'critical', a.case_id, a.institution_id, `,${isT ? a.to_bureau : a.bureau_code},`, a.region_code,
          isT ? `${a.case_no} transferred to ${a.to_bureau} by ${a.from_bureau}` : `${a.case_no} escalated to Competent Authority`, a.remarks, a.at);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('seeded_at', ?)").run(nowIso());
    db.prepare("INSERT INTO audit_log (at, user_id, action, entity, details) VALUES (?, NULL, 'system.seed', 'database', ?)").run(nowIso(), JSON.stringify(stats));
  });
  // Older alerts are resolved by the engine based on state.
  engine.reloadInstitutions();
  engine.refreshAlerts({ emit: false });

  const counts = db.prepare("SELECT status, COUNT(*) n FROM cases GROUP BY status").all();
  const groups = engine.overlapGroups();
  log(`Seeded in ${Date.now() - t0} ms`);
  log(`  institutions: ${institutions.length}, users: ${users.length}, cases: ${stats.cases} (paired cross-bureau: ${stats.paired}), documents: ${docCount}`);
  log(`  institution references resolved by fuzzy/acronym matching: ${stats.fuzzy}; awaiting review: ${stats.review}; unresolved: ${stats.unresolved}`);
  log(`  wrong auto-matches: ${stats.wrong}`, stats.wrongExamples);
  log('  status:', counts.map((c) => `${c.status}=${c.n}`).join(', '));
  log(`  overlap groups (non-dismissed): ${groups.length} (open: ${groups.filter((g) => g.status === 'open').length})`);
  log(`  alerts: ${db.prepare('SELECT COUNT(*) n FROM alerts WHERE resolved_at IS NULL').get().n} active`);
  log(`  demo password for all users: ${DEMO_PASSWORD}`);
  return stats;
}

function wrap(text, width) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > width) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines;
}

export { T as TEMPLATES, COURSES, MONTHS, FIRST, LAST, fill, nameVariant };
