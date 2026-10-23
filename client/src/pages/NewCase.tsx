import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Building2, CheckCircle2, GitMerge, HelpCircle, Sparkles, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useLookups, useToast } from '../lib/context';
import { fmtDate, isoToday } from '../lib/format';
import type { MatchCandidate, Status } from '../lib/types';
import { BureauChip, Button, Card, ErrorBox, Field, Input, PageHeader, ScoreBar, Select, StatusBadge, Textarea } from '../components/ui';

interface Analysis {
  institution: { decision: 'auto' | 'review' | 'unresolved'; candidates: MatchCandidate[] };
  classification: { category: string; categoryName: string; confidence: number; keywords: string[]; alternatives: Array<{ category: string; name: string; keywords: string[] }>; priority: string; priorityReason: string; suggestedBureau: string; crossBureauHint: string | null };
  existing: Array<{ id: number; case_no: string; bureau_code: string; status: Status; category: string; subject: string; received_on: string; officer_name: string | null }>;
  similar: Array<{ id: number; case_no: string; bureau_code: string; status: Status; subject: string; received_on: string; similarity: number | null; terms: string[]; sameComplainant?: boolean }>;
  overlap: { title: string; message: string; bureaus: string[] } | null;
}

const EMPTY = {
  complainant_name: '', complainant_type: 'Student', complainant_email: '', complainant_phone: '',
  aicte_id: '', institution_name: '', city: '', state: '',
  source: 'AICTE Grievance Portal', external_ref: '', received_on: isoToday(), subject: '', description: '',
  category: '', priority: '', bureau_code: '',
};

export default function NewCase() {
  const { meta, bureauName, categoryName } = useLookups();
  const { user } = useAuth();
  const { push } = useToast();
  const nav = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [picked, setPicked] = useState<number | null>(null);
  const [touched, setTouched] = useState<{ category?: boolean; priority?: boolean; bureau?: boolean }>({});
  const up = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  // Debounced live analysis
  const analysisInput = useMemo(() => ({ institution_name: f.institution_name, aicte_id: f.aicte_id, city: f.city, state: f.state, subject: f.subject, description: f.description, complainant_email: f.complainant_email, complainant_phone: f.complainant_phone }), [f]);
  const [debounced, setDebounced] = useState(analysisInput);
  useEffect(() => { const t = setTimeout(() => setDebounced(analysisInput), 450); return () => clearTimeout(t); }, [analysisInput]);
  const enabled = !!(debounced.institution_name || debounced.aicte_id || debounced.subject || debounced.description);
  const { data: a, isFetching } = useQuery({ queryKey: ['intake', debounced], enabled, queryFn: () => api<Analysis>('/intake/analyze', { body: debounced }), placeholderData: (p) => p });

  // Auto-pick a confident institution match; clear pick when inputs change to something else.
  useEffect(() => {
    if (!a) return;
    const top = a.institution.candidates[0];
    if (a.institution.decision === 'auto' && top) setPicked(top.institution.id);
    else if (picked && !a.institution.candidates.some((c) => c.institution.id === picked)) setPicked(null);
  }, [a]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestion = a?.classification;
  const category = touched.category ? f.category : f.category || suggestion?.category || '';
  const priority = touched.priority ? f.priority : f.priority || suggestion?.priority || 'Normal';
  const defaultBureau = user?.role === 'admin' ? suggestion?.suggestedBureau : user?.bureau_code;
  const bureau = touched.bureau ? f.bureau_code : f.bureau_code || defaultBureau || suggestion?.suggestedBureau || 'PGRC';
  const pickedInst = a?.institution.candidates.find((c) => c.institution.id === picked)?.institution;
  const otherBureauActive = a?.existing.filter((e) => e.status !== 'Disposed' && e.bureau_code !== bureau) ?? [];

  const m = useMutation({
    mutationFn: () => api<{ case: { id: number; case_no: string }; overlap: unknown }>('/cases', { body: { ...f, category, priority, bureau_code: bureau, institution_id: picked ?? undefined } }),
    onSuccess: (r) => {
      push({ tone: r.overlap ? 'warning' : 'good', title: `Registered ${r.case.case_no}`, body: r.overlap ? 'Potential Overlapping Cases – Coordination Required: other Bureaus/Cells have active cases on this institution.' : 'Complaint registered and assigned.' });
      nav(`/cases/${r.case.id}`);
    },
  });

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Cases', to: '/cases' }, { label: 'Register complaint' }]} title="Register a complaint"
        subtitle="The system identifies the institution, suggests category and handling Bureau/Cell, and warns about overlaps before you submit." />
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <Card title="1. Institution">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="AICTE Permanent ID" hint="If quoted by the complainant"><Input value={f.aicte_id} onChange={up('aicte_id')} placeholder="1-XXXXXXXXXX" /></Field>
              <Field label="Institution name as written"><Input value={f.institution_name} onChange={up('institution_name')} placeholder="e.g. Aryabhata Engg College, Nagpur" /></Field>
              <Field label="City / district"><Input value={f.city} onChange={up('city')} /></Field>
              <Field label="State">
                <Select value={f.state} onChange={up('state')}>
                  <option value="">—</option>
                  {meta?.regions.flatMap((r) => r.states).sort().map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
            {a && (f.institution_name || f.aicte_id) && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  {a.institution.decision === 'auto' ? <><CheckCircle2 className="size-4 text-good-text" />Institution identified</>
                    : a.institution.decision === 'review' ? <><HelpCircle className="size-4 text-warning-text" />Please confirm the institution</>
                    : <><AlertTriangle className="size-4 text-serious-text" />No confident match — pick one or register as unidentified</>}
                  {isFetching && <span className="text-xs font-normal text-ink-3">checking…</span>}
                </div>
                <ul className="divide-y divide-hairline tile rounded-2xl">
                  {a.institution.candidates.map((c) => (
                    <li key={c.institution.id}>
                      <label className={clsx('flex cursor-pointer items-start gap-3 px-3 py-2.5', picked === c.institution.id && 'bg-accent-soft/50')}>
                        <input type="radio" name="inst" className="mt-1" checked={picked === c.institution.id} onChange={() => setPicked(c.institution.id)} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{c.institution.name}</div>
                          <div className="text-xs text-ink-3">{c.institution.aicte_id} · {c.institution.city}, {c.institution.state}</div>
                          <div className="mt-0.5 text-xs text-ink-2">{c.reasons.join(' · ')}</div>
                        </div>
                        <ScoreBar value={c.score} />
                      </label>
                    </li>
                  ))}
                  <li><label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm text-ink-2"><input type="radio" name="inst" checked={picked === null} onChange={() => setPicked(null)} />Register without identifying (goes to the identification queue)</label></li>
                </ul>
              </div>
            )}
          </Card>

          <Card title="2. Complaint">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Source"><Select value={f.source} onChange={up('source')}>{meta?.sources.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="External reference" hint="CPGRAMS no., letter no."><Input value={f.external_ref} onChange={up('external_ref')} /></Field>
              <Field label="Date of receipt" required><Input type="date" value={f.received_on} max={isoToday()} onChange={up('received_on')} required /></Field>
            </div>
            <div className="mt-3 space-y-3">
              <Field label="Subject" required><Input value={f.subject} onChange={up('subject')} required placeholder="One-line summary" /></Field>
              <Field label="Description" required><Textarea rows={6} value={f.description} onChange={up('description')} required placeholder="Complaint text as received" /></Field>
            </div>
            {suggestion && (f.subject || f.description) && (
              <div className="mt-3 rounded-2xl border border-accent/30 bg-accent-soft p-3.5 text-sm">
                <div className="flex items-center gap-2 font-medium text-accent-text"><Sparkles className="size-4" />Suggested classification</div>
                <div className="mt-1 text-ink-2">
                  <b>{suggestion.categoryName}</b> ({Math.round(suggestion.confidence * 100)}% confidence{suggestion.keywords.length ? `; keywords: ${suggestion.keywords.join(', ')}` : ''}) · Priority <b>{suggestion.priority}</b> ({suggestion.priorityReason}) · Handle in <b>{bureauName(suggestion.suggestedBureau)}</b>
                </div>
                {!!suggestion.alternatives.length && <div className="mt-1 text-xs text-ink-3">Also mentions: {suggestion.alternatives.map((x) => x.name).join(', ')}</div>}
                {suggestion.crossBureauHint && <div className="mt-2 flex items-start gap-1.5 text-warning-text"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{suggestion.crossBureauHint}</div>}
                <Button type="button" size="sm" className="mt-2" onClick={() => { setF((s) => ({ ...s, category: suggestion.category, priority: suggestion.priority, bureau_code: user?.role === 'admin' ? suggestion.suggestedBureau : s.bureau_code })); setTouched({ category: true, priority: true, bureau: user?.role === 'admin' }); }}><Wand2 className="size-3.5" />Apply suggestion</Button>
              </div>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Category" required>
                <Select value={category} onChange={(e) => { setTouched((t) => ({ ...t, category: true })); setF((s) => ({ ...s, category: e.target.value })); }} required>
                  <option value="">Choose…</option>
                  {meta?.categories.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.sla} days)</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={priority} onChange={(e) => { setTouched((t) => ({ ...t, priority: true })); setF((s) => ({ ...s, priority: e.target.value })); }}>
                  {meta?.priorities.map((p) => <option key={p}>{p}</option>)}
                </Select>
              </Field>
              <Field label="Register with Bureau/Cell">
                <Select value={bureau} disabled={user?.role !== 'admin'} onChange={(e) => { setTouched((t) => ({ ...t, bureau: true })); setF((s) => ({ ...s, bureau_code: e.target.value })); }}>
                  {meta?.bureaus.map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
                </Select>
              </Field>
            </div>
            {category && <p className="mt-2 text-xs text-ink-3">Prescribed timeline for {categoryName(category)}: {meta?.categories.find((c) => c.code === category)?.sla} days from receipt.</p>}
          </Card>

          <Card title="3. Complainant">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={f.complainant_name} onChange={up('complainant_name')} /></Field>
              <Field label="Type"><Select value={f.complainant_type} onChange={up('complainant_type')}>{meta?.complainantTypes.map((t) => <option key={t}>{t}</option>)}</Select></Field>
              <Field label="Email"><Input type="email" value={f.complainant_email} onChange={up('complainant_email')} /></Field>
              <Field label="Phone"><Input value={f.complainant_phone} onChange={up('complainant_phone')} inputMode="tel" /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card title="Pre-registration check" subtitle="Updates as you type">
            {!a ? <p className="text-sm text-ink-3">Enter the institution and complaint to check for existing, overlapping or duplicate cases.</p> : (
              <div className="space-y-4">
                {pickedInst ? (
                  <div className="flex items-start gap-2 text-sm"><Building2 className="mt-0.5 size-4 text-ink-3" /><div><div className="font-medium">{pickedInst.name}</div><div className="text-xs text-ink-3">{pickedInst.aicte_id} · {a.existing.length} earlier complaint(s)</div></div></div>
                ) : <p className="text-sm text-warning-text">Institution not selected — overlap check limited to complainant matching.</p>}
                {pickedInst && otherBureauActive.length > 0 && (
                  <div className="rounded-2xl border border-critical/35 bg-critical-soft p-3.5 text-sm">
                    <div className="flex items-center gap-2 font-semibold text-critical-text"><GitMerge className="size-4" />Potential Overlapping Cases – Coordination Required</div>
                    <p className="mt-1 text-ink-2">Active cases on this institution with {[...new Set(otherBureauActive.map((e) => e.bureau_code))].map(bureauName).join(', ')}. Registering with {bureau} creates parallel action — coordinate, or register and link.</p>
                  </div>
                )}
                {!!a.similar.length && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-ink-3">Possible duplicates</div>
                    <ul className="space-y-1.5">
                      {a.similar.map((s) => (
                        <li key={s.id}><Link to={`/cases/${s.id}`} target="_blank" className="block tile rounded-2xl p-2.5 hover:border-accent">
                          <div className="flex items-center gap-2 text-sm"><span className="font-medium">{s.case_no}</span><BureauChip code={s.bureau_code} />{s.similarity !== null ? <ScoreBar value={s.similarity} className="ml-auto" /> : <span className="ml-auto text-xs text-warning-text">same complainant</span>}</div>
                          <div className="truncate text-xs text-ink-2">{s.subject}</div>
                          {!!s.terms.length && <div className="text-[11px] text-ink-3">common: {s.terms.join(', ')}</div>}
                        </Link></li>
                      ))}
                    </ul>
                  </div>
                )}
                {pickedInst && !!a.existing.length && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-ink-3">Complaint history ({a.existing.length})</div>
                    <ul className="max-h-60 space-y-1 overflow-y-auto">
                      {a.existing.slice(0, 12).map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-sm"><BureauChip code={e.bureau_code} /><span className="min-w-0 flex-1 truncate" title={e.subject}>{e.subject}</span><span className="text-xs text-ink-3">{fmtDate(e.received_on)}</span><StatusBadge status={e.status} /></li>
                      ))}
                    </ul>
                  </div>
                )}
                {pickedInst && !a.existing.length && !a.similar.length && <p className="flex items-center gap-1.5 text-sm text-good-text"><CheckCircle2 className="size-4" />No earlier complaints on this institution.</p>}
              </div>
            )}
          </Card>
          <ErrorBox error={m.error} />
          <Button type="submit" variant="primary" className="w-full" loading={m.isPending} disabled={!f.subject || !f.description || !category}>Register complaint</Button>
        </div>
      </form>
    </div>
  );
}
