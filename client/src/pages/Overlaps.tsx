import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, Eye, GitMerge, HelpCircle, Link2, RotateCcw, Users, XCircle } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth, useLookups, useToast } from '../lib/context';
import { fmtDate, relTime } from '../lib/format';
import { bureauColor } from '../lib/colors';
import type { DuplicatePair, MatchCandidate, OverlapGroup } from '../lib/types';
import { BureauChip, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, ScoreBar, Select, SeverityBadge, Spinner, StatusBadge, Tabs, Textarea } from '../components/ui';

type Tab = 'overlaps' | 'duplicates' | 'identify';

export default function Overlaps() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'overlaps';
  const { data: groups } = useQuery({ queryKey: ['overlaps', 'all-active'], queryFn: () => api<OverlapGroup[]>('/overlaps') });
  const { data: dups } = useQuery({ queryKey: ['duplicates', ''], queryFn: () => api<DuplicatePair[]>('/duplicates') });
  const { data: queue } = useQuery({ queryKey: ['resolution-queue'], queryFn: () => api<unknown[]>('/resolution-queue') });
  return (
    <div>
      <PageHeader title="Overlaps & duplicates" subtitle="Cases on the same institution handled by more than one Bureau/Cell, likely duplicate complaints, and complaints whose institution still needs to be identified." />
      <Tabs value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} tabs={[
        { value: 'overlaps', label: <><GitMerge className="size-4" />Cross-Bureau overlaps</>, count: groups?.filter((g) => g.status === 'open').length },
        { value: 'duplicates', label: <><Link2 className="size-4" />Possible duplicates</>, count: dups?.length },
        { value: 'identify', label: <><HelpCircle className="size-4" />Identify institution</>, count: queue?.length },
      ]} />
      {tab === 'overlaps' && <OverlapList />}
      {tab === 'duplicates' && <Duplicates />}
      {tab === 'identify' && <IdentifyQueue />}
    </div>
  );
}

function OverlapList() {
  const { meta } = useLookups();
  const [status, setStatus] = useState('');
  const [bureau, setBureau] = useState('');
  const [rbpgrc, setRbpgrc] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['overlaps', status, bureau, rbpgrc], queryFn: () => api<OverlapGroup[]>(`/overlaps${qs({ status, bureau, rbpgrc: rbpgrc ? '1' : '' })}`) });
  const loc = useLocation();
  useEffect(() => {
    if (!data || !loc.hash) return;
    const el = document.getElementById(loc.hash.slice(1));
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('ring-2', 'ring-accent'); setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 2500); }
  }, [data, loc.hash]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Coordination status">
          <option value="">Open, acknowledged & coordinated</option><option value="open">Open — needs coordination</option><option value="acknowledged">Acknowledged</option><option value="coordinated">Coordinated</option><option value="dismissed">Dismissed</option>
        </Select>
        <Select className="w-auto" value={bureau} onChange={(e) => setBureau(e.target.value)} aria-label="Bureau/Cell">
          <option value="">Any Bureau/Cell</option>{meta?.bureaus.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rbpgrc} onChange={(e) => setRbpgrc(e.target.checked)} />Only RB + PGRC</label>
        <span className="ml-auto text-sm text-ink-3">{data?.length ?? 0} institution(s)</span>
      </div>
      <ErrorBox error={error} />
      {isLoading ? <Spinner /> : !data?.length ? <Empty icon={<CheckCircle2 className="size-8" />} title="No overlaps in this view" /> : (
        <div className="space-y-4">{data.map((g) => <OverlapCard key={g.institution_id} g={g} />)}</div>
      )}
    </div>
  );
}

function OverlapCard({ g }: { g: OverlapGroup }) {
  const { bureauName, categoryName } = useLookups();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { push } = useToast();
  const [modal, setModal] = useState<null | 'coordinated' | 'dismissed' | 'acknowledged'>(null);
  const [lead, setLead] = useState(g.lead_bureau ?? (g.bureaus.includes('RB') ? 'RB' : g.bureaus[0]));
  const [note, setNote] = useState('');
  const canReview = user?.role === 'admin' || (user?.bureau_code && g.bureaus.includes(user.bureau_code));
  const m = useMutation({
    mutationFn: (status: string) => api(`/overlaps/${g.institution_id}/review`, { body: { status, lead_bureau: status === 'coordinated' ? lead : undefined, note } }),
    onSuccess: (_r, status) => { qc.invalidateQueries(); setModal(null); setNote(''); push({ tone: 'good', title: `Overlap ${status}`, body: g.institution?.name }); },
  });
  const byBureau = g.bureaus.map((b) => ({ b, cases: g.cases.filter((c) => c.bureau_code === b) }));
  const strongPairs = g.pairs.filter((p) => p.similarity >= 0.25 || p.sameComplainant).sort((a, b) => b.similarity - a.similarity).slice(0, 3);

  return (
    <section id={`inst-${g.institution_id}`} className={clsx('glass scroll-mt-24 rounded-[28px] transition-shadow', g.status === 'open' && 'ring-1 ring-critical/35')}>
      <header className="flex flex-wrap items-start gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/institutions/${g.institution_id}`} className="font-semibold hover:underline">{g.institution?.name}</Link>
            <SeverityBadge severity={g.severity} />
            <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', g.status === 'open' ? 'bg-critical-soft text-critical-text' : g.status === 'coordinated' ? 'bg-good-soft text-good-text' : 'bg-surface-2 text-ink-2')}>
              {g.status === 'open' ? 'Coordination required' : g.status === 'coordinated' ? `Coordinated · lead ${g.lead_bureau}` : g.status === 'acknowledged' ? 'Acknowledged' : 'Dismissed'}
            </span>
            {g.reopened && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-text">New case since last review</span>}
          </div>
          <div className="mt-0.5 text-xs text-ink-3">{g.institution?.aicte_id} · {g.institution?.city}, {g.institution?.state} · latest complaint {fmtDate(g.since)}{g.reviewed_at && ` · reviewed ${relTime(g.reviewed_at)}`}</div>
        </div>
        {canReview && (
          <div className="flex flex-wrap gap-2">
            {g.status === 'open' && <Button size="sm" onClick={() => setModal('acknowledged')}><Eye className="size-3.5" />Acknowledge</Button>}
            {g.status !== 'coordinated' && g.status !== 'dismissed' && <Button size="sm" variant="primary" onClick={() => setModal('coordinated')}><Users className="size-3.5" />Designate lead</Button>}
            {g.status !== 'dismissed' && <Button size="sm" variant="ghost" onClick={() => setModal('dismissed')}><XCircle className="size-3.5" />Not related</Button>}
            {g.status !== 'open' && <Button size="sm" variant="ghost" loading={m.isPending} onClick={() => m.mutate('open')}><RotateCcw className="size-3.5" />Reopen</Button>}
          </div>
        )}
      </header>
      <div className="px-5 py-4">
        <ul className="mb-3 space-y-0.5 text-sm text-ink-2">{g.reasons.map((r) => <li key={r} className="flex gap-2"><span className="text-muted">•</span>{r}</li>)}</ul>
        {g.note && <p className="mb-3 rounded-2xl bg-surface-2 px-3 py-2 text-sm text-ink-2"><b>Coordination note:</b> {g.note}</p>}
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
          {byBureau.map(({ b, cases }) => (
            <div key={b} className="tile rounded-2xl">
              <div className="flex items-center gap-2 border-b border-hairline px-3.5 py-2.5 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ background: bureauColor(b) }} />
                {bureauName(b)}{g.lead_bureau === b && <span className="rounded bg-good-soft px-1.5 text-xs text-good-text">lead</span>}
              </div>
              <ul className="divide-y divide-hairline">
                {cases.map((c) => (
                  <li key={c.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><Link to={`/cases/${c.id}`} className="text-sm font-medium text-accent-text hover:underline">{c.case_no}</Link><span className="ml-auto"><StatusBadge status={c.status} /></span></div>
                    <div className="mt-0.5 text-sm">{c.subject}</div>
                    <div className="text-xs text-ink-3">{categoryName(c.category)} · {c.officer_name ?? 'unassigned'} · {c.last_action} {relTime(c.last_action_on)}</div>
                    <div className="mt-0.5 text-[11px] text-ink-3">Linked by: {c.match_reason}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {!!strongPairs.length && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {strongPairs.map((p) => (
              <span key={p.a + p.b} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-ink-2">
                {p.a.split('/').slice(1, 2)}/{p.a.split('/').pop()} ↔ {p.b.split('/').slice(1, 2)}/{p.b.split('/').pop()}: {Math.round(p.similarity * 100)}% similar{p.sameComplainant ? ' · same complainant' : ''}{p.terms.length ? ` (${p.terms.slice(0, 3).join(', ')})` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'coordinated' ? 'Designate lead Bureau/Cell' : modal === 'dismissed' ? 'Mark as not related' : 'Acknowledge overlap'}
        footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant={modal === 'dismissed' ? 'danger' : 'primary'} loading={m.isPending} onClick={() => modal && m.mutate(modal)}>Confirm</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{modal === 'coordinated' ? 'The lead Bureau/Cell takes primary action; others await its outcome before acting independently. All cases will be linked and a coordination entry added to each case history.' : modal === 'dismissed' ? 'Use when the complaints are about unrelated matters and parallel handling is appropriate. The overlap will reappear if a new case is added.' : 'Record that the involved Bureaus/Cells are aware of each other’s cases.'}</p>
          {modal === 'coordinated' && <Field label="Lead Bureau/Cell"><Select value={lead} onChange={(e) => setLead(e.target.value)}>{g.bureaus.map((b) => <option key={b} value={b}>{bureauName(b)}</option>)}</Select></Field>}
          <Field label="Note"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision / instructions for the Bureaus/Cells" /></Field>
          <ErrorBox error={m.error} />
        </div>
      </Modal>
    </section>
  );
}

function Duplicates() {
  const [cross, setCross] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['duplicates', cross], queryFn: () => api<DuplicatePair[]>(`/duplicates${qs({ cross: cross ? '1' : '' })}`) });
  const link = useMutation({ mutationFn: (p: DuplicatePair) => api(`/cases/${p.a.id}/links`, { body: { other_id: p.b.id, link_type: p.crossBureau ? 'overlap' : 'duplicate', note: 'Linked from duplicate review.' } }), onSuccess: () => qc.invalidateQueries() });
  const dismiss = useMutation({ mutationFn: (p: DuplicatePair) => api('/duplicates/dismiss', { body: { a: p.a.id, b: p.b.id } }), onSuccess: () => qc.invalidateQueries() });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} />Only across different Bureaus/Cells</label>
        <span className="text-sm text-ink-3">Pairs on the same institution within 180 days whose text is similar (TF-IDF) or that share a complainant.</span>
      </div>
      {isLoading ? <Spinner /> : !data?.length ? <Empty title="No unreviewed duplicates" /> : (
        <div className="space-y-3">
          {data.map((p) => (
            <Card key={p.key} bodyClass="p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link to={`/institutions/${p.institution.id}`} className="font-medium hover:underline">{p.institution.name}</Link>
                <span className="text-xs text-ink-3">{p.institution.aicte_id}</span>
                <span className="ml-auto flex items-center gap-2">{p.sameComplainant && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-text">same complainant</span>}{p.crossBureau && <span className="rounded-full bg-critical-soft px-2 py-0.5 text-xs text-critical-text">cross-Bureau</span>}<ScoreBar value={p.score} /></span>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {[p.a, p.b].map((c) => (
                  <Link key={c.id} to={`/cases/${c.id}`} className="tile rounded-2xl p-3 hover:border-accent">
                    <div className="flex items-center gap-2"><BureauChip code={c.bureau_code} /><span className="text-sm font-medium">{c.case_no}</span><span className="ml-auto"><StatusBadge status={c.status} /></span></div>
                    <div className="mt-1 text-sm">{c.subject}</div>
                    <div className="text-xs text-ink-3">{fmtDate(c.received_on)} · {c.complainant_name ?? '—'}</div>
                  </Link>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex-1 text-xs text-ink-3">{p.reasons.join(' · ')}</span>
                <Button size="sm" loading={link.isPending && link.variables?.key === p.key} onClick={() => link.mutate(p)}><Link2 className="size-3.5" />Link cases</Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(p)}><XCircle className="size-3.5" />Not duplicate</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface QueueItem { id: number; case_no: string; bureau_code: string; status: string; subject: string; received_on: string; institution_name_raw: string | null; aicte_id_raw: string | null; institution_city_raw: string | null; match_score: number | null; candidates: MatchCandidate[] }
function IdentifyQueue() {
  const qc = useQueryClient();
  const { push } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['resolution-queue'], queryFn: () => api<QueueItem[]>('/resolution-queue') });
  const m = useMutation({
    mutationFn: ({ caseId, instId }: { caseId: number; instId: number }) => api<{ overlap: unknown }>(`/cases/${caseId}/resolve-institution`, { body: { institution_id: instId } }),
    onSuccess: (r) => { qc.invalidateQueries(); push({ tone: r.overlap ? 'warning' : 'good', title: 'Institution confirmed', body: r.overlap ? 'Overlap detected with other Bureaus/Cells.' : undefined }); },
  });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <Empty icon={<CheckCircle2 className="size-8" />} title="All complaints are linked to an institution" />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-3">These complaints named an institution the system could not match with confidence (misspelt names, abbreviations, no AICTE ID). Confirming them lets overlap detection work.</p>
      {data.map((q) => (
        <Card key={q.id} bodyClass="p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link to={`/cases/${q.id}`} className="font-medium text-accent-text hover:underline">{q.case_no}</Link><BureauChip code={q.bureau_code} />
            <span className="text-ink-2">{q.subject}</span><span className="ml-auto text-xs text-ink-3">{fmtDate(q.received_on)}</span>
          </div>
          <div className="mt-1 text-sm">Written as: <b>“{q.institution_name_raw}”</b>{q.aicte_id_raw && <> · ID {q.aicte_id_raw}</>}{q.institution_city_raw && <> · {q.institution_city_raw}</>}</div>
          <ul className="mt-2 divide-y divide-hairline tile rounded-2xl">
            {q.candidates.map((c) => (
              <li key={c.institution.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{c.institution.name}</div><div className="text-xs text-ink-3">{c.institution.aicte_id} · {c.institution.city} · {c.reasons.join(' · ')}</div></div>
                <ScoreBar value={c.score} />
                <Button size="sm" variant="primary" loading={m.isPending && m.variables?.caseId === q.id && m.variables?.instId === c.institution.id} onClick={() => m.mutate({ caseId: q.id, instId: c.institution.id })}>Confirm</Button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
