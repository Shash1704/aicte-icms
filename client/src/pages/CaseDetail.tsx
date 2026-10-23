import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertOctagon, ArrowRight, ArrowRightLeft, Building2, CheckCircle2, ChevronRight, CircleDot, ClipboardCheck, FileText, Gavel, GitMerge, HelpCircle,
  Link2, Mail, MessageSquare, Paperclip, Phone, Printer, RotateCcw, Search, Send, Unlink, UserCheck, Users, XCircle,
} from 'lucide-react';
import { api, openDocument } from '../lib/api';
import { useAuth, useLookups, useToast } from '../lib/context';
import { bytes, fmtDate, fmtDateTime } from '../lib/format';
import { bureauColor } from '../lib/colors';
import type { CaseDetail as TCase, CaseAction } from '../lib/types';
import {
  BureauChip, Button, Card, Empty, ErrorBox, Field, Input, KeyVal, PageHeader, PriorityBadge, ScoreBar, Select, SeverityBadge, SlaBadge, Spinner, StatusBadge, Textarea,
} from '../components/ui';

const ACTION_ICON: Record<string, React.ReactNode> = {
  REGISTERED: <FileText className="size-4" />, ASSIGNED: <UserCheck className="size-4" />, FORWARDED: <Send className="size-4" />, REMINDER: <RotateCcw className="size-4" />,
  REPLY: <Mail className="size-4" />, SCN: <Gavel className="size-4" />, HEARING: <Users className="size-4" />, INSPECTION: <ClipboardCheck className="size-4" />,
  COORDINATION: <MessageSquare className="size-4" />, TRANSFER: <ArrowRightLeft className="size-4" />, ACCEPTED: <CheckCircle2 className="size-4" />,
  ESCALATE: <AlertOctagon className="size-4" />, DIRECTION: <Gavel className="size-4" />, DISPOSE: <CheckCircle2 className="size-4" />, REOPEN: <RotateCcw className="size-4" />,
  LINKED: <Link2 className="size-4" />, NOTE: <MessageSquare className="size-4" />, INSTITUTION_RESOLVED: <Building2 className="size-4" />,
};

export default function CaseDetail() {
  const { id } = useParams();
  const { data: c, isLoading, error } = useQuery({ queryKey: ['case', id], queryFn: () => api<TCase>(`/cases/${id}`) });
  const { categoryName, bureauName, regionName } = useLookups();

  if (isLoading) return <Spinner />;
  if (error || !c) return <ErrorBox error={error ?? new Error('Not found')} />;

  const movement = [c.origin_bureau, ...c.actions.filter((a) => a.action_type === 'TRANSFER').map((a) => a.to_bureau!)];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Cases', to: '/cases' }, { label: c.case_no }]}
        title={<span className="flex flex-wrap items-center gap-2">{c.case_no}<StatusBadge status={c.status} /><SlaBadge state={c.sla.state} daysLeft={c.sla.daysLeft} /><PriorityBadge priority={c.priority} /></span>}
        subtitle={c.subject}
        actions={<Button onClick={() => window.print()}><Printer className="size-4" />Print case sheet</Button>}
      />

      {c.overlap && c.overlap.cases.length > 1 && <OverlapBanner c={c} />}
      {!c.institution_id && <ResolvePanel c={c} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Card title="Case details">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <KeyVal label="Complaint / Case ID">{c.case_no}</KeyVal>
              <KeyVal label="Date of receipt">{fmtDate(c.received_on)}</KeyVal>
              <KeyVal label="Source">{c.source}{c.external_ref && <div className="text-xs text-ink-3">Ref: {c.external_ref}</div>}</KeyVal>
              <KeyVal label="Nature / category">{categoryName(c.category)}</KeyVal>
              <KeyVal label="Current status"><StatusBadge status={c.status} /></KeyVal>
              <KeyVal label="Presently with"><BureauChip code={c.bureau_code} full name={bureauName(c.bureau_code)} /></KeyVal>
              <KeyVal label="Assigned officer">{c.officer_name ?? <span className="text-warning-text">Not assigned</span>}</KeyVal>
              <KeyVal label="Last action taken">{c.last_action}<div className="text-xs text-ink-3">{fmtDateTime(c.last_action_on)}</div></KeyVal>
              <KeyVal label="Next action required">{c.next_action ?? '—'}{c.next_action_due && <div className="text-xs text-ink-3">by {fmtDate(c.next_action_due)}</div>}</KeyVal>
              <KeyVal label="Expected disposal date">{fmtDate(c.expected_disposal)}</KeyVal>
              <KeyVal label="Received by">{bureauName(c.origin_bureau)}</KeyVal>
              <KeyVal label="Region">{regionName(c.region_code)}</KeyVal>
              {c.status === 'Disposed' && <>
                <KeyVal label="Disposed on">{fmtDate(c.disposed_on)}</KeyVal>
                <KeyVal label="Disposal">{c.disposal_type}</KeyVal>
              </>}
            </dl>
            <SlaBar c={c} />
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-ink-3">Movement:</span>
              {movement.map((b, i) => (
                <span key={i} className="flex items-center gap-2">{i > 0 && <ChevronRight className="size-4 text-muted" />}<BureauChip code={b} name={bureauName(b)} /></span>
              ))}
            </div>
          </Card>

          <Card title="Complaint">
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{c.description}</p>
            <div className="mt-4 grid gap-3 border-t border-hairline pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <KeyVal label="Complainant">{c.complainant_name ?? '—'}<div className="text-xs text-ink-3">{c.complainant_type}</div></KeyVal>
              <KeyVal label="Email">{c.complainant_email ? <span className="flex min-w-0 items-start gap-1 break-all"><Mail className="mt-0.5 size-3.5 shrink-0 text-ink-3" />{c.complainant_email}</span> : '—'}</KeyVal>
              <KeyVal label="Phone">{c.complainant_phone ? <span className="inline-flex items-center gap-1"><Phone className="size-3.5 text-ink-3" />{c.complainant_phone}</span> : '—'}</KeyVal>
              <KeyVal label="Institution as written">“{c.institution_name_raw}”{c.aicte_id_raw && <div className="text-xs text-ink-3">ID quoted: {c.aicte_id_raw}</div>}{c.match_method && c.institution_id && <div className="text-xs text-ink-3">Matched by {c.match_method === 'aicte-id' ? 'AICTE ID' : c.match_method === 'manual' ? 'officer confirmation' : `${c.match_method} (${Math.round((c.match_score ?? 0) * 100)}%)`}</div>}</KeyVal>
            </div>
          </Card>

          <Card title="Workflow & action history" subtitle={`${c.actions.length} entries · chronological`}>
            <Timeline actions={c.actions} docs={c.documents} />
          </Card>
        </div>

        <div className="space-y-4">
          <ActionPanel c={c} />
          {c.institution && (
            <Card title="Institution" actions={<Link to={`/institutions/${c.institution.id}`} className="text-sm text-accent-text hover:underline">Profile</Link>}>
              <div className="font-medium">{c.institution.name}</div>
              <div className="text-sm text-ink-3">AICTE ID {c.institution.aicte_id}</div>
              <div className="mt-1 text-sm text-ink-2">{c.institution.address}, {c.institution.city}, {c.institution.state} {c.institution.pincode}</div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs"><span className="rounded bg-surface-2 px-1.5 py-0.5">{c.institution.type}</span><span className="rounded bg-surface-2 px-1.5 py-0.5">{c.institution.ownership}</span><span className="rounded bg-surface-2 px-1.5 py-0.5">{c.institution.approval_status}</span></div>
              {!!c.institutionCases.length && (
                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-medium text-ink-3">Other complaints on this institution ({c.institutionCases.length})</div>
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {c.institutionCases.map((o) => (
                      <li key={o.id}><Link to={`/cases/${o.id}`} className={clsx('flex items-center gap-2 rounded-xl px-2 py-1 text-sm hover:bg-surface-2', o.status !== 'Disposed' && o.bureau_code !== c.bureau_code && 'bg-critical-soft/50')}>
                        <BureauChip code={o.bureau_code} /><span className="min-w-0 flex-1 truncate">{o.subject}</span><StatusBadge status={o.status} />
                      </Link></li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
          <LinksCard c={c} />
          <DuplicatesCard c={c} />
          {!!c.similar.length && (
            <Card title="Similar complaints" subtitle="Text similarity across all institutions">
              <ul className="space-y-2">
                {c.similar.map((s) => (
                  <li key={s.id}><Link to={`/cases/${s.id}`} className="block rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium">{s.case_no}</span><BureauChip code={s.bureau_code} /><ScoreBar value={s.similarity} className="ml-auto" /></div>
                    <div className="truncate text-xs text-ink-3">{s.institution_name ?? 'Unidentified'} · {s.subject}</div>
                  </Link></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SlaBar({ c }: { c: TCase }) {
  const p = Math.min(100, Math.max(0, c.sla.pctUsed));
  const tone = c.sla.state === 'breached' || c.sla.state === 'missed' ? 'var(--critical)' : c.sla.state === 'approaching' ? 'var(--warning)' : 'var(--good)';
  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-xs text-ink-3">
        <span>Received {fmtDate(c.received_on)}</span>
        <span>{c.status === 'Disposed' ? `Disposed in ${c.sla.age} days (timeline ${c.sla.total} days)` : `Day ${c.sla.age} of ${c.sla.total}`}</span>
        <span>Due {fmtDate(c.expected_disposal)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${p}%`, background: tone }} />
      </div>
    </div>
  );
}

function OverlapBanner({ c }: { c: TCase }) {
  const g = c.overlap!;
  const others = g.cases.filter((x) => x.id !== c.id);
  return (
    <div className="mb-4 rounded-[10px] border border-critical/35 bg-critical-soft p-5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2">
        <GitMerge className="size-5 text-critical-text" />
        <span className="font-semibold text-critical-text">Potential Overlapping Cases – Coordination Required</span>
        <SeverityBadge severity={g.severity} />
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-2">Coordination: {g.status}{g.lead_bureau ? ` · lead ${g.lead_bureau}` : ''}</span>
      </div>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-2">{g.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {others.map((o) => (
          <Link key={o.id} to={`/cases/${o.id}`} className="tile rounded-lg p-3 hover:border-accent">
            <div className="flex items-center gap-2"><BureauChip code={o.bureau_code} /><span className="text-sm font-medium">{o.case_no}</span></div>
            <div className="mt-1 truncate text-xs text-ink-2">{o.subject}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-3"><StatusBadge status={o.status} />{o.officer_name}</div>
          </Link>
        ))}
      </div>
      <Link to={`/overlaps#inst-${g.institution_id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-critical-text hover:underline">Open coordination <ArrowRight className="size-4" /></Link>
    </div>
  );
}

function ResolvePanel({ c }: { c: TCase }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const { data: found } = useQuery({ queryKey: ['match', search], enabled: search.length > 2, queryFn: () => api<TCase['candidates']>(`/intake/match?name=${encodeURIComponent(search)}`) });
  const m = useMutation({
    mutationFn: (institution_id: number) => api<{ overlap: unknown }>(`/cases/${c.id}/resolve-institution`, { body: { institution_id } }),
    onSuccess: (r) => { qc.invalidateQueries(); push({ tone: r.overlap ? 'warning' : 'good', title: 'Institution identified', body: r.overlap ? 'This institution has active cases with other Bureaus/Cells — overlap flagged.' : 'Case linked to the institution profile.' }); },
  });
  const list = search.length > 2 ? found ?? [] : c.candidates;
  return (
    <Card className="mb-4 border-warning" title={<span className="flex items-center gap-2"><HelpCircle className="size-4 text-warning-text" />Institution not yet identified</span>}
      subtitle={`The complainant wrote “${c.institution_name_raw ?? ''}”${c.aicte_id_raw ? ` with ID ${c.aicte_id_raw}` : ''}${c.institution_city_raw ? `, ${c.institution_city_raw}` : ''}. Confirm the institution so overlaps can be detected.`}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search another name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <ErrorBox error={m.error} />
      <ul className="divide-y divide-hairline">
        {list.map((cand) => (
          <li key={cand.institution.id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{cand.institution.name}</div>
              <div className="text-xs text-ink-3">{cand.institution.aicte_id} · {cand.institution.city}, {cand.institution.state}</div>
              <div className="text-xs text-ink-2">{cand.reasons.join(' · ')}</div>
            </div>
            <ScoreBar value={cand.score} />
            <Button size="sm" variant="primary" loading={m.isPending && m.variables === cand.institution.id} onClick={() => m.mutate(cand.institution.id)}>Confirm</Button>
          </li>
        ))}
        {!list.length && <li className="py-3 text-sm text-ink-3">No candidates. Search by another name above.</li>}
      </ul>
    </Card>
  );
}

function Timeline({ actions, docs }: { actions: CaseAction[]; docs: TCase['documents'] }) {
  const { actionLabel, bureauName } = useLookups();
  const [showSystem, setShowSystem] = useState(true);
  const list = showSystem ? actions : actions.filter((a) => !['ASSIGNED', 'LINKED'].includes(a.action_type));
  return (
    <div>
      <label className="no-print mb-3 flex items-center gap-2 text-xs text-ink-3"><input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />Show assignment & linking entries</label>
      <ol className="relative space-y-0">
        {list.map((a, i) => {
          const special = a.action_type === 'TRANSFER' ? 'border-[var(--s7)] text-[var(--s7)]' : a.action_type === 'ESCALATE' ? 'border-critical text-critical-text' : a.action_type === 'DISPOSE' ? 'border-good text-good-text' : 'border-line text-ink-2';
          const aDocs = docs.filter((d) => d.action_id === a.id);
          return (
            <li key={a.id} className="relative flex gap-3 pb-5">
              {i < list.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-hairline" />}
              <span className={clsx('z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-surface', special)}>{ACTION_ICON[a.action_type] ?? <CircleDot className="size-4" />}</span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{actionLabel(a.action_type)}</span>
                  {a.action_type === 'TRANSFER' && <span className="flex items-center gap-1 text-sm"><BureauChip code={a.from_bureau} /><ArrowRight className="size-3.5" /><BureauChip code={a.to_bureau} /></span>}
                  {a.from_status && a.to_status && a.from_status !== a.to_status && a.action_type !== 'TRANSFER' && <span className="text-xs text-ink-3">{a.from_status} → {a.to_status}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                  <span title={fmtDateTime(a.at)}>{fmtDateTime(a.at)}</span>
                  <span>·</span>
                  <span>{a.actor_name ?? 'System'}{a.actor_designation ? `, ${a.actor_designation}` : ''}</span>
                  {a.bureau_code && <><span>·</span><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: bureauColor(a.bureau_code) }} />{bureauName(a.bureau_code)}</span></>}
                </div>
                {a.remarks && <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">{a.remarks}</p>}
                {a.next_action && a.action_type !== 'ASSIGNED' && <div className="mt-1 text-xs text-ink-3">Next: {a.next_action}{a.next_action_due && ` (by ${fmtDate(a.next_action_due)})`}</div>}
                {!!aDocs.length && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {aDocs.map((d) => (
                      <button type="button" key={d.id} onClick={() => openDocument(d.id).catch(() => {})} className="inline-flex items-center gap-1.5 tile rounded-full px-2.5 py-1 text-xs text-accent-text hover:bg-surface-2">
                        <Paperclip className="size-3.5" />{d.filename}<span className="text-ink-3">{bytes(d.size)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ActionPanel({ c }: { c: TCase }) {
  const { meta, bureauName } = useLookups();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { push } = useToast();
  const canAct = c.permissions.canAct;
  const options = useMemo(() => {
    if (!canAct) return c.permissions.canDirect ? ['DIRECTION', 'COORDINATION'] : ['COORDINATION'];
    if (c.status === 'Disposed') return ['REOPEN', 'NOTE'];
    if (c.status === 'Transferred') return ['ACCEPTED', 'TRANSFER', 'NOTE'];
    const base = ['FORWARDED', 'REMINDER', 'REPLY', 'SCN', 'HEARING', 'INSPECTION', 'COORDINATION', 'NOTE', 'TRANSFER', 'ESCALATE', 'DISPOSE'];
    return c.status === 'Escalated' ? [...(c.permissions.canDirect ? ['DIRECTION'] : []), 'NOTE', 'COORDINATION', 'DISPOSE'] : base;
  }, [c, canAct]);
  const [type, setType] = useState(options[0]);
  const [remarks, setRemarks] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [toBureau, setToBureau] = useState('');
  const [disposal, setDisposal] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [officer, setOfficer] = useState('');
  const effectiveType = options.includes(type) ? type : options[0];

  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.set('type', effectiveType); fd.set('remarks', remarks);
      if (nextAction) fd.set('next_action', nextAction);
      if (nextDue) fd.set('next_action_due', nextDue);
      if (effectiveType === 'TRANSFER') fd.set('to_bureau', toBureau);
      if (effectiveType === 'DISPOSE') fd.set('disposal_type', disposal);
      for (const f of Array.from(files ?? [])) fd.append('files', f);
      return api(`/cases/${c.id}/actions`, { form: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      push({ tone: 'good', title: 'Action recorded', body: `${meta?.actionTypes.find((a) => a.code === effectiveType)?.label} on ${c.case_no}` });
      setRemarks(''); setNextAction(''); setNextDue(''); setFiles(null); setDisposal(''); setToBureau('');
    },
  });
  const assign = useMutation({
    mutationFn: () => api(`/cases/${c.id}/assign`, { body: { officer_id: Number(officer) } }),
    onSuccess: () => { qc.invalidateQueries(); push({ tone: 'good', title: 'Officer assigned' }); setOfficer(''); },
  });
  const officers = meta?.users.filter((u) => u.bureau_code === c.bureau_code && (u.role === 'officer' || u.role === 'regional' || u.role === 'head') && (c.bureau_code !== 'RO' || u.region_code === c.region_code)) ?? [];
  const remarksRequired = ['TRANSFER', 'ESCALATE', 'DISPOSE', 'REOPEN', 'DIRECTION', 'COORDINATION'].includes(effectiveType);

  return (
    <Card className="no-print" title={canAct ? 'Take action' : 'Coordinate'} subtitle={canAct ? `Acting as ${user?.name} (${user?.bureau_code ?? 'Competent Authority'})` : `This case is handled by ${bureauName(c.bureau_code)}. You can leave a coordination note for them.`}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Action">
          <Select value={effectiveType} onChange={(e) => setType(e.target.value)}>
            {options.map((o) => <option key={o} value={o}>{meta?.actionTypes.find((a) => a.code === o)?.label ?? o}</option>)}
          </Select>
        </Field>
        {effectiveType === 'TRANSFER' && (
          <Field label="Transfer to" required>
            <Select value={toBureau} onChange={(e) => setToBureau(e.target.value)} required>
              <option value="">Choose Bureau/Cell…</option>
              {meta?.bureaus.filter((b) => b.code !== c.bureau_code).map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
            </Select>
          </Field>
        )}
        {effectiveType === 'DISPOSE' && (
          <Field label="Disposal type" required>
            <Select value={disposal} onChange={(e) => setDisposal(e.target.value)} required>
              <option value="">Choose…</option>
              {meta?.disposalTypes.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Remarks" required={remarksRequired}>
          <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} required={remarksRequired}
            placeholder={effectiveType === 'COORDINATION' ? 'e.g. RB has issued SCN on the same issue; PGRC to await outcome.' : 'What was done and why'} />
        </Field>
        {!['TRANSFER', 'ESCALATE', 'DISPOSE', 'COORDINATION'].includes(effectiveType) && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Next action"><Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Await reply" /></Field>
            <Field label="Due by"><Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} /></Field>
          </div>
        )}
        {effectiveType !== 'COORDINATION' && (
          <Field label="Supporting documents" hint="PDF, image, Word or Excel · up to 5 files, 10 MB each">
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => setFiles(e.target.files)} className="block w-full text-sm text-ink-2 file:mr-2 file:rounded-full file:border file:border-hairline file:bg-surface-2 file:px-2 file:py-1 file:text-sm" />
          </Field>
        )}
        <ErrorBox error={m.error} />
        <Button type="submit" variant={effectiveType === 'ESCALATE' ? 'danger' : 'primary'} className="w-full" loading={m.isPending}>
          {meta?.actionTypes.find((a) => a.code === effectiveType)?.label ?? 'Submit'}
        </Button>
      </form>
      {c.permissions.canAssign && c.status !== 'Disposed' && (
        <div className="mt-4 border-t border-hairline pt-3">
          <Field label="Reassign officer">
            <div className="flex gap-2">
              <Select value={officer} onChange={(e) => setOfficer(e.target.value)}>
                <option value="">Choose officer…</option>
                {officers.map((o) => <option key={o.id} value={o.id}>{o.name} — {o.designation}</option>)}
              </Select>
              <Button disabled={!officer} loading={assign.isPending} onClick={() => assign.mutate()}>Assign</Button>
            </div>
          </Field>
          <ErrorBox error={assign.error} />
        </div>
      )}
    </Card>
  );
}

function LinksCard({ c }: { c: TCase }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState('');
  const [type, setType] = useState('related');
  const [note, setNote] = useState('');
  const add = useMutation({ mutationFn: () => api(`/cases/${c.id}/links`, { body: { other_case_no: other, link_type: type, note } }), onSuccess: () => { qc.invalidateQueries(); setOpen(false); setOther(''); setNote(''); } });
  const del = useMutation({ mutationFn: (id: number) => api(`/links/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries() });
  return (
    <Card title="Linked cases" actions={<Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}><Link2 className="size-3.5" />Link</Button>}>
      {open && (
        <form className="mb-3 space-y-2 rounded-lg bg-surface-2 p-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <Input placeholder="Case ID e.g. AICTE/RB/2026/00012" value={other} onChange={(e) => setOther(e.target.value)} required />
          <div className="flex gap-2">
            <Select value={type} onChange={(e) => setType(e.target.value)}><option value="related">Related</option><option value="overlap">Overlap</option><option value="duplicate">Duplicate</option></Select>
            <Button type="submit" variant="primary" loading={add.isPending}>Link</Button>
          </div>
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorBox error={add.error} />
        </form>
      )}
      {c.links.length ? (
        <ul className="space-y-1.5">
          {c.links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs capitalize text-ink-2">{l.link_type}</span>
              <Link to={`/cases/${l.other_id}`} className="font-medium hover:underline">{l.other_case_no}</Link>
              <BureauChip code={l.other_bureau} />
              <span className="ml-auto"><StatusBadge status={l.other_status} /></span>
              <button className="rounded p-1 text-ink-3 hover:bg-surface-2" title="Remove link" onClick={() => del.mutate(l.id)}><Unlink className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-3">No linked cases.</p>}
    </Card>
  );
}

function DuplicatesCard({ c }: { c: TCase }) {
  const qc = useQueryClient();
  const link = useMutation({ mutationFn: (otherId: number) => api(`/cases/${c.id}/links`, { body: { other_id: otherId, link_type: 'duplicate', note: 'Confirmed as duplicate from suggestion.' } }), onSuccess: () => qc.invalidateQueries() });
  const dismiss = useMutation({ mutationFn: (otherId: number) => api('/duplicates/dismiss', { body: { a: c.id, b: otherId } }), onSuccess: () => qc.invalidateQueries() });
  const list = c.duplicates.filter((d) => !d.linked);
  if (!list.length) return null;
  return (
    <Card title={<span className="flex items-center gap-2"><GitMerge className="size-4 text-warning-text" />Possible duplicates</span>} subtitle="Same institution, similar content or same complainant">
      {list.length ? (
        <ul className="space-y-3">
          {list.map((d) => (
            <li key={d.key} className="tile rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Link to={`/cases/${d.other!.id}`} className="text-sm font-medium hover:underline">{d.other!.case_no}</Link>
                <BureauChip code={d.other!.bureau_code} /><ScoreBar value={d.score} className="ml-auto" />
              </div>
              <div className="mt-1 truncate text-xs text-ink-2">{d.other!.subject}</div>
              <ul className="mt-1 space-y-0.5 text-xs text-ink-3">{d.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
              <div className="mt-2 flex gap-2">
                <Button size="sm" loading={link.isPending && link.variables === d.other!.id} onClick={() => link.mutate(d.other!.id)}><Link2 className="size-3.5" />Link as duplicate</Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(d.other!.id)}><XCircle className="size-3.5" />Not a duplicate</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty title="No duplicates" />}
    </Card>
  );
}

