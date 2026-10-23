// Data-matching engine.
//
// 1. InstitutionMatcher — resolves a free-text institution reference ("SVIT Engg Clg, Nagpur",
//    a mistyped AICTE ID, an old name) to the institution master, with a score and reasons.
//    Uses: AICTE ID normalisation, abbreviation expansion, IDF-weighted soft token matching
//    (Jaro-Winkler for spelling variants), acronym detection and location cues.
// 2. TextIndex — TF-IDF vectors over complaint text to find complaints that describe the same
//    grievance in different words (duplicates filed with several Bureaus/Cells).
//
// Everything is deterministic and explainable — each match carries human-readable reasons,
// which matters for a government system where officials must justify linking cases.

const ABBREVIATIONS = {
  engg: 'engineering', eng: 'engineering', engr: 'engineering', engineerng: 'engineering',
  inst: 'institute', instt: 'institute', insti: 'institute', institue: 'institute',
  tech: 'technology', techn: 'technology', technol: 'technology', technological: 'technology',
  coll: 'college', clg: 'college', colg: 'college', coe: 'college engineering',
  mgmt: 'management', mgt: 'management', manag: 'management',
  univ: 'university', uni: 'university',
  sci: 'science', sciences: 'science',
  pharm: 'pharmacy', pharma: 'pharmacy', pharmaceutical: 'pharmacy',
  arch: 'architecture', archi: 'architecture',
  polytech: 'polytechnic', poly: 'polytechnic',
  res: 'research', resch: 'research',
  edu: 'education', educ: 'education', educational: 'education',
  st: 'saint', sri: 'sri', shri: 'sri', shree: 'sri', sree: 'sri',
  dr: 'doctor', govt: 'government', pvt: 'private',
  ctr: 'centre', center: 'centre', cntr: 'centre',
  comp: 'computer', computers: 'computer', appl: 'applied', adv: 'advanced', studies: 'study',
  women: 'women', womens: 'women', mahila: 'women',
};
const NAME_STOPWORDS = new Set(['of', 'and', 'the', 'for', 'in', 'at', 'a', 'an', 'to', 'by', 'ltd', 'limited', 'trust', 'society']);

export function normalizeAicteId(s) {
  if (!s) return '';
  const digits = String(s).replace(/[^0-9]/g, '');
  if (!digits) return '';
  // Canonical format is "1-<digits>". Accept "1-123", "1 123", "1123" (with leading 1).
  const m = String(s).trim().match(/^\s*1\s*[-/ ]\s*(\d+)\s*$/);
  if (m) return `1-${m[1]}`;
  return digits.startsWith('1') && digits.length > 6 ? `1-${digits.slice(1)}` : `1-${digits}`;
}

export function tokenizeName(s) {
  if (!s) return [];
  const cleaned = String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.'’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const out = [];
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue;
    const exp = ABBREVIATIONS[raw] ?? raw;
    for (const t of exp.split(' ')) if (t && !NAME_STOPWORDS.has(t)) out.push(t);
  }
  return out;
}

export function acronymOf(name) {
  const words = String(name)
    .replace(/&/g, ' ')
    .replace(/[^A-Za-z ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NAME_STOPWORDS.has(w.toLowerCase()));
  return words.map((w) => w[0].toLowerCase()).join('');
}

// Jaro-Winkler similarity in [0,1].
export function jaroWinkler(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const range = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - range), hi = Math.min(i + range + 1, lb);
    for (let j = lo; j < hi; j++) {
      if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; matches++; break; }
    }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / la + matches / lb + (matches - t / 2) / matches) / 3;
  let p = 0;
  while (p < 4 && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

const tokenSim = (a, b) => {
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4) return 0; // short tokens must match exactly
  const s = jaroWinkler(a, b);
  return s >= 0.92 ? s : 0;
};

export class InstitutionMatcher {
  constructor(institutions) {
    this.rebuild(institutions);
  }

  rebuild(institutions) {
    this.items = institutions.map((inst) => {
      const names = [inst.name, ...(Array.isArray(inst.aliases) ? inst.aliases : JSON.parse(inst.aliases || '[]'))];
      return {
        inst,
        aicte: normalizeAicteId(inst.aicte_id),
        names: names.map((n) => ({ raw: n, tokens: [...new Set(tokenizeName(n))], acronym: acronymOf(n) })),
        city: (inst.city || '').toLowerCase(),
        district: (inst.district || '').toLowerCase(),
        state: (inst.state || '').toLowerCase(),
      };
    });
    // Document frequency of name tokens → IDF so "institute"/"technology" weigh little and distinctive
    // words ("aryabhatta", "nagpur") weigh a lot.
    const df = new Map();
    for (const it of this.items) {
      const seen = new Set(it.names.flatMap((n) => n.tokens));
      for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
    }
    const N = this.items.length || 1;
    this.idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
    this.byAicte = new Map(this.items.map((it) => [it.aicte, it]));
  }

  // Soft TF-IDF cosine between query tokens and candidate tokens.
  softScore(qTokens, cTokens) {
    if (!qTokens.length || !cTokens.length) return { score: 0, matched: [] };
    let dot = 0;
    const matched = [];
    const used = new Set();
    for (const q of qTokens) {
      let best = 0, bestTok = null;
      for (const c of cTokens) {
        if (used.has(c)) continue;
        const s = tokenSim(q, c);
        if (s > best) { best = s; bestTok = c; }
      }
      if (bestTok) {
        used.add(bestTok);
        dot += this.idf(q) * this.idf(bestTok) * best;
        matched.push(q === bestTok ? q : `${q}≈${bestTok}`);
      }
    }
    const nq = Math.sqrt(qTokens.reduce((s, t) => s + this.idf(t) ** 2, 0));
    const nc = Math.sqrt(cTokens.reduce((s, t) => s + this.idf(t) ** 2, 0));
    return { score: dot / (nq * nc), matched };
  }

  /**
   * @param {{name?: string, aicteId?: string, city?: string, state?: string}} q
   * @returns {Array<{institution, score, method, reasons: string[]}>} best first
   */
  match(q, limit = 5) {
    const results = [];
    const qa = normalizeAicteId(q.aicteId);
    if (qa && this.byAicte.has(qa)) {
      const it = this.byAicte.get(qa);
      const reasons = [`AICTE Permanent ID ${it.inst.aicte_id} matches exactly`];
      if (q.name) {
        const { score } = this.softScore([...new Set(tokenizeName(q.name))], it.names[0].tokens);
        if (score < 0.4) reasons.push('Name given differs from records — verify');
      }
      return [{ institution: it.inst, score: 1, method: 'aicte-id', reasons }];
    }

    const qTokensAll = [...new Set(tokenizeName(q.name))];
    const qCity = (q.city || '').toLowerCase().trim();
    const qState = (q.state || '').toLowerCase().trim();
    // Location words inside the name ("..., Nagpur") count as location cues and are not
    // required to match the institution's *name* tokens.
    for (const it of this.items) {
      const cityTokens = new Set([...tokenizeName(it.city), ...tokenizeName(it.district)]);
      const qTokens = qTokensAll.filter((t) => !cityTokens.has(t));
      const cityInName = qTokensAll.some((t) => cityTokens.has(t));
      let best = { score: 0, matched: [], name: it.names[0].raw, via: 'name' };
      for (const n of it.names) {
        const nameTokens = n.tokens.filter((t) => !cityTokens.has(t));
        const r = this.softScore(qTokens.length ? qTokens : qTokensAll, nameTokens.length ? nameTokens : n.tokens);
        if (r.score > best.score) best = { ...r, name: n.raw, via: n.raw === it.inst.name ? 'name' : 'alias' };
        // Acronym: "AIET" ↔ "Aryabhatta Institute of Engineering & Technology"
        if (n.acronym.length >= 3) {
          // Accept "AIET" and the common "AIETN" form (acronym + first letter of city).
          const cityInitial = it.city ? it.city[0] : '';
          const acrHit = qTokensAll.find((t) => t === n.acronym || (cityInitial && t === n.acronym + cityInitial));
          if (acrHit) {
            const s = 0.72 + (qTokensAll.length <= 2 ? 0.05 : 0);
            if (s > best.score) best = { score: s, matched: [acrHit.toUpperCase()], name: n.raw, via: 'acronym' };
          }
        }
      }
      if (best.score < 0.3) continue;
      let score = best.score;
      const reasons = [];
      if (best.via === 'acronym') reasons.push(`"${best.matched[0]}" is the acronym of "${best.name}"`);
      else {
        reasons.push(`Name similarity ${Math.round(best.score * 100)}% with ${best.via === 'alias' ? 'former/alternate name' : 'registered name'} "${best.name}"`);
        const fuzzy = best.matched.filter((m) => m.includes('≈'));
        if (fuzzy.length) reasons.push(`Spelling variants: ${fuzzy.join(', ')}`);
      }
      const locMatch = (qCity && (qCity === it.city || qCity === it.district)) || cityInName;
      if (locMatch) { score = Math.min(1, score + 0.12); reasons.push(`Location matches (${it.inst.city})`); }
      else if (qCity && qCity !== it.city && qCity !== it.district) { score -= 0.15; reasons.push(`City differs (${q.city} vs ${it.inst.city})`); }
      if (qState && qState === it.state) score = Math.min(1, score + 0.03);
      else if (qState && it.state && qState !== it.state) score -= 0.1;
      if (qa && it.aicte !== qa) {
        // A wrong/partial ID: give a little credit if digits overlap heavily.
        const sim = jaroWinkler(qa, it.aicte);
        if (sim > 0.9) { score = Math.min(1, score + 0.05); reasons.push(`AICTE ID close to ${it.inst.aicte_id} (possible typo)`); }
      }
      results.push({ institution: it.inst, score: Math.max(0, Math.min(1, score)), method: best.via === 'acronym' ? 'acronym' : 'fuzzy-name', reasons });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /** Decide whether the top candidate is safe to auto-link. */
  static decide(cands) {
    if (!cands.length) return { decision: 'unresolved' };
    const [top, second] = cands;
    if (top.method === 'aicte-id') return { decision: 'auto', ...top };
    const margin = top.score - (second?.score ?? 0);
    // Without a location cue to confirm it, a second strong candidate means a human should decide
    // (e.g. "Mahima Inst Technology" vs "Mahima Institute of Technology & Management").
    const locationConfirmed = top.reasons.some((r) => r.startsWith('Location matches'));
    if (!locationConfirmed && second && second.score >= 0.8) return { decision: 'review', ...top };
    if (top.score >= 0.85 && margin >= 0.08) return { decision: 'auto', ...top };
    if (top.score >= 0.55) return { decision: 'review', ...top };
    return { decision: 'unresolved' };
  }
}

// ---------------------------------------------------------------------------------------------
// Complaint text similarity (TF-IDF cosine)

const TEXT_STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further had has have having he her
here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on
once only or other our ours ourselves out over own same she should so some such than that the their theirs them
themselves then there these they this those through to too under until up very was we were what when where which while
who whom why will with would you your yours yourself yourselves also kindly please sir madam respected request
requested humble humbly regarding dear institute institution college aicte complaint complain student students
matter take necessary action issue permanent`.split(/\s+/));

// Light, consistent suffix stripping: certificate/certificates, secure/secured, issue/issuing all collapse.
const stem = (w) => {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && /(ss|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
};

// Stem → a real word seen in the text, so explanations read "secured" rather than "secur".
const SURFACE = new Map();
export const surfaceOf = (st) => (/^rs\d+$/.test(st) ? `₹${Number(st.slice(2)).toLocaleString('en-IN')}` : SURFACE.get(st) ?? st);

export function tokenizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1') // "1,35,000" → "135000"
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    // Amounts (5+ digits) are kept: the same rupee figure in two complaints is strong evidence.
    .filter((w) => w.length > 2 && !TEXT_STOPWORDS.has(w) && (!/^\d+$/.test(w) || w.length >= 5))
    .map((w) => (/^\d+$/.test(w) ? `rs${w}` : w))
    .map((w) => {
      const st = stem(w);
      if (!SURFACE.has(st) || w.length < SURFACE.get(st).length) SURFACE.set(st, w);
      return st;
    });
}

export class TextIndex {
  constructor() {
    this.docs = new Map(); // id -> Map(term -> tf)
    this.df = new Map();
    this.vecCache = new Map();
  }
  get N() { return this.docs.size; }
  add(id, text) {
    if (this.docs.has(id)) this.remove(id);
    const tf = new Map();
    for (const t of tokenizeText(text)) tf.set(t, (tf.get(t) || 0) + 1);
    this.docs.set(id, tf);
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.vecCache.clear();
  }
  remove(id) {
    const tf = this.docs.get(id);
    if (!tf) return;
    for (const t of tf.keys()) this.df.set(t, this.df.get(t) - 1);
    this.docs.delete(id);
    this.vecCache.clear();
  }
  idf(t) { return Math.log((this.N + 1) / ((this.df.get(t) || 0) + 1)) + 1; }
  vectorFor(tf) {
    const v = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * this.idf(t);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  }
  vector(id) {
    if (!this.vecCache.has(id)) this.vecCache.set(id, this.vectorFor(this.docs.get(id) || new Map()));
    return this.vecCache.get(id);
  }
  static cosine(a, b) {
    let s = 0;
    const [small, large] = a.size < b.size ? [a, b] : [b, a];
    for (const [t, w] of small) { const o = large.get(t); if (o) s += w * o; }
    return s;
  }
  /** Similarity between two indexed docs, with top shared terms for explanation. */
  compare(idA, idB) {
    const a = this.vector(idA), b = this.vector(idB);
    return { score: TextIndex.cosine(a, b), terms: TextIndex.sharedTerms(a, b) };
  }
  static sharedTerms(a, b, k = 5) {
    const shared = [];
    for (const [t, w] of a) { const o = b.get(t); if (o) shared.push([t, w * o]); }
    return shared.sort((x, y) => y[1] - x[1]).slice(0, k).map(([t]) => surfaceOf(t));
  }
  /** Score free text (not yet indexed) against a set of indexed ids. */
  query(text, ids, k = 5) {
    const tf = new Map();
    for (const t of tokenizeText(text)) tf.set(t, (tf.get(t) || 0) + 1);
    const q = this.vectorFor(tf);
    const out = [];
    for (const id of ids) {
      if (!this.docs.has(id)) continue;
      const v = this.vector(id);
      const score = TextIndex.cosine(q, v);
      if (score > 0) out.push({ id, score, terms: TextIndex.sharedTerms(q, v) });
    }
    return out.sort((x, y) => y.score - x.score).slice(0, k);
  }
}
