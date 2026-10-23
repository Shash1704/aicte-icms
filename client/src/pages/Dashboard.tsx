import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertOctagon, AlertTriangle, ArrowRight, ArrowRightLeft, ArrowUpRight, CheckCircle2, ChevronDown, Clock, Files, GitMerge,
  Hourglass, Plus, TrendingUp,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../lib/api';
import { useAuth, useLive } from '../lib/context';
import { fmtDate, fmtDateTime, monthLabel, num, pct, relTime } from '../lib/format';
import { bureauColor, STATUS_COLOR } from '../lib/colors';
import { BarsChart, ChartTooltip, LinesChart, useTokens } from '../components/charts';
import { BureauChip, ErrorBox, SeverityBadge, Spinner } from '../components/ui';
import { ScopeFilters, useFilterParams } from '../components/FilterBar';
import { OverlapIllustration } from '../components/Illustrations';
import type { CaseRow, Severity } from '../lib/types';

interface Metrics { received: number; disposed: number; pending: number; not_started: number; under_process: number; transferred_now: number; escalated_now: number; beyond_sla: number; approaching: number; disposed_in_sla: number; avg_disposal_days: number; avg_pending_age: number; transferred: number; escalated: number; disposal_rate: number; sla_compliance: number }
interface DashboardData {
  kpis: Metrics & { received_today: number; disposed_today: number; received_30d: number; disposed_30d: number; institutions: number; institutions_active: number; unresolved: number };
  trend: Array<{ month: string; received: number; disposed: number; in_sla: number }>;
  bureaus: Array<Metrics & { code: string; name: string }>;
  regions: Array<Metrics & { code: string; name: string; office: string }>;
  ageing: Array<Record<string, number | string>>;
  categories: Array<{ code: string; name: string; total: number; active: number }>;
  topInstitutions: Array<{ id: number; name: string; aicte_id: string; city: string; region_code: string; total: number; active: number; breached: number; bureaus: string[]; s_pending: number; s_process: number; s_transferred: number; s_escalated: number; s_disposed: number; overlap: boolean }>;
  recent: Array<{ id: number; at: string; action_type: string; bureau_code: string; to_bureau: string | null; to_status: string | null; remarks: string | null; case_id: number; case_no: string; institution_name: string | null; actor_name: string | null }>;
  overlaps: { open: number; acknowledged: number; coordinated: number; rbPgrc: number; cases: number; top: Array<{ institution_id: number; institution: { name: string; aicte_id: string; city: string } | null; severity: Severity; bureaus: string[]; cases: number; reasons: string[] }> };
  generated_at: string;
}

const ACTION_VERB: Record<string, string> = {
  REGISTERED: 'Registered', FORWARDED: 'Forwarded', REMINDER: 'Reminder', REPLY: 'Reply in', SCN: 'Show-cause', HEARING: 'Hearing',
  INSPECTION: 'Inspection', COORDINATION: 'Coordination', TRANSFER: 'Transferred', ACCEPTED: 'Accepted', ESCALATE: 'Escalated',
  DIRECTION: 'Direction', DISPOSE: 'Disposed', REOPEN: 'Reopened', LINKED: 'Linked', NOTE: 'Note', INSTITUTION_RESOLVED: 'Identified',
};

const firstName = (n?: string) => (n ?? '').replace(/^(Prof\.|Dr\.)\s*/, '').split(' ')[0];
const shortNo = (no: string) => no.replace('AICTE/', '');

/** Live IST clock, formatted like the reference ("10.29 am"). */
function useClock() {
  const fmt = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).replace(':', '.').toLowerCase();
  const [t, setT] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setT(fmt()), 15_000); return () => clearInterval(id); }, []);
  return t;
}

/** Remembers (per viewer) whether the detailed statistics are open. Opens them when filters are applied. */
function useDetailsOpen(filtered: boolean) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('icms.dash.details') === '1'; } catch { return false; }
  });
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem('icms.dash.details', o ? '0' : '1'); } catch { /* ignore */ }
    return !o;
  });
  return [open || filtered, toggle] as const;
}

export default function Dashboard() {
  const { values } = useFilterParams();
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard', values], queryFn: () => api<DashboardData>(`/dashboard${qs(values)}`), refetchInterval: 60000 });
  const caseLink = (extra: Record<string, string>) => `/cases${qs({ ...values, ...extra })}`;
  const filtered = Object.values(values).some(Boolean);
  const [details, toggleDetails] = useDetailsOpen(filtered);

  return (
    <div>
      <ErrorBox error={error} />
      {isLoading || !data ? <Spinner /> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* First view: only what needs the official today */}
          <div className="min-w-0 space-y-6">
            <Greeting data={data} />
            <OverlapBanner data={data} />
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <NeedsAttention />
              <div className="space-y-4">
                <InkStat to={caseLink({ active: '1' })} alt={false} label="Pending cases" value={data.kpis.pending}
                  sub={`${num(data.kpis.not_started)} yet to be acted upon`}
                  foot={[['Under process', data.kpis.under_process], ['Transferred', data.kpis.transferred_now], ['Escalated', data.kpis.escalated_now]]} />
                <InkStat to={caseLink({ sla: 'breached', active: '1' })} alt label="Beyond timeline" value={data.kpis.beyond_sla}
                  sub={`${num(data.kpis.approaching)} more due within 7 days`}
                  foot={[['Received', data.kpis.received], ['Disposed', data.kpis.disposed]]} />
              </div>
            </div>
          </div>

          <aside className="min-w-0 space-y-5 xl:border-l xl:border-hairline xl:pl-6" aria-label="Summary">
            <TrendCard data={data} />
            <DisposalCard data={data} caseLink={caseLink} />
          </aside>

          {/* Everything else stays one click away */}
          <div className="xl:col-span-2">
            <button onClick={toggleDetails} aria-expanded={details}
              className="mx-auto flex items-center gap-2 rounded-[14px] bg-surface-2 px-5 py-3 text-sm font-medium text-ink transition hover:bg-surface-3">
              {details ? 'Hide detailed statistics' : 'Show detailed statistics'}
              <ChevronDown className={clsx('size-4 transition-transform', details && 'rotate-180')} />
            </button>
            {details && (
              <div className="reveal mt-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl">Detailed statistics</h2>
                    <p className="text-xs text-ink-3">Filter by Bureau/Cell, region or period</p>
                  </div>
                  <ScopeFilters />
                </div>

                <section>
                  <div className="glass grid grid-cols-2 gap-1.5 rounded-[24px] p-2 lg:grid-cols-4">
                    <StripKpi to={caseLink({})} icon={<Files className="size-5" />} label="Total received" value={data.kpis.received} sub={`+${num(data.kpis.received_30d)} in 30 days`} />
                    <StripKpi to={caseLink({ active: '1' })} icon={<Hourglass className="size-5" />} label="Pending" value={data.kpis.pending} sub={`${num(data.kpis.not_started)} yet to be acted upon`} accent />
                    <StripKpi to={caseLink({ status: 'Disposed' })} icon={<CheckCircle2 className="size-5" />} label="Disposed" value={data.kpis.disposed} sub={`${pct(data.kpis.disposal_rate)} disposal rate`} />
                    <StripKpi to={caseLink({ sla: 'breached' })} icon={<AlertTriangle className="size-5" />} label="Beyond timeline" value={data.kpis.beyond_sla} sub={`${num(data.kpis.approaching)} due within 7 days`} critical />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MiniKpi to={caseLink({ status: 'Under Process' })} icon={<TrendingUp className="size-4" />} label="Under process" value={data.kpis.under_process} sub={`avg. age ${data.kpis.avg_pending_age ?? '—'} days`} />
                    <MiniKpi to={caseLink({ status: 'Transferred' })} icon={<ArrowRightLeft className="size-4" />} label="Transferred" value={data.kpis.transferred} sub={`${num(data.kpis.transferred_now)} awaiting acceptance`} />
                    <MiniKpi to={caseLink({ status: 'Escalated' })} icon={<AlertOctagon className="size-4" />} label="Escalated" value={data.kpis.escalated} sub={`${num(data.kpis.escalated_now)} awaiting direction`} />
                    <MiniKpi to="/overlaps" icon={<GitMerge className="size-4" />} label="Overlapping institutions" value={data.overlaps.open + data.overlaps.acknowledged + data.overlaps.coordinated} sub={`${num(data.overlaps.open)} open · ${num(data.overlaps.coordinated)} coordinated`} />
                  </div>
                </section>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                  <section className="glass rounded-[24px] p-5">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base">Received vs disposed</h2>
                        <p className="text-xs text-ink-3">Last 12 months</p>
                      </div>
                      <Link to="/reports?type=performance" className={pillLink}>Performance report <ArrowUpRight className="size-3.5" /></Link>
                    </div>
                    <LinesChart height={270} data={data.trend} x="month" xFormatter={monthLabel}
                      series={[{ key: 'received', name: 'Received', color: 'var(--b1)' }, { key: 'disposed', name: 'Disposed', color: 'var(--b2)' }]} />
                  </section>
                  <div className="space-y-5">
                    <section>
                      <div className="mb-3 flex items-center justify-between px-1">
                        <h2 className="text-base">Performance goals</h2>
                        <Link to="/reports?type=disposal" className="flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink">All reports <Plus className="size-3.5" /></Link>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <Goal label="Disposal rate" value={data.kpis.disposal_rate} />
                        <Goal label="Disposed on time" value={data.kpis.sla_compliance} />
                        <Goal label="Overlaps coordinated" value={(() => { const t = data.overlaps.open + data.overlaps.acknowledged + data.overlaps.coordinated; return t ? Math.round((data.overlaps.coordinated / t) * 100) : 100; })()} />
                      </div>
                    </section>
                    <section>
                      <div className="mb-3 flex items-center justify-between px-1">
                        <h2 className="text-base">Bureau/Cell workload</h2>
                        <Link to={caseLink({ active: '1' })} className="text-xs font-medium text-ink-3 hover:text-ink">Open cases</Link>
                      </div>
                      <WorkloadCard bureaus={data.bureaus} received30={data.kpis.received_30d} disposed30={data.kpis.disposed_30d} onPick={(b) => nav(caseLink({ bureau: b, active: '1' }))} />
                    </section>
                  </div>
                </div>

                <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  <section className="glass rounded-[24px] p-5">
                    <h2 className="text-base">Active cases by Bureau/Cell</h2>
                    <p className="mb-3 text-xs text-ink-3">Current status · click a bar to open those cases</p>
                    <BarsChart horizontal stacked height={250} data={data.bureaus.filter((b) => b.received)} x="code"
                      onClick={(row) => nav(caseLink({ bureau: String(row.code), active: '1' }))}
                      series={[
                        { key: 'not_started', name: 'Pending', color: STATUS_COLOR.Pending },
                        { key: 'under_process', name: 'Under Process', color: STATUS_COLOR['Under Process'] },
                        { key: 'transferred_now', name: 'Transferred', color: STATUS_COLOR.Transferred },
                        { key: 'escalated_now', name: 'Escalated', color: STATUS_COLOR.Escalated },
                      ]} />
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead><tr className="text-left text-ink-3">
                          <th className="py-2">Bureau/Cell</th><th className="py-2 text-right">Active</th><th className="py-2 text-right">Overdue</th>
                          <th className="py-2 text-right">Avg. age</th><th className="py-2 text-right">Disposal</th><th className="py-2 text-right">On time</th>
                        </tr></thead>
                        <tbody className="tnum">
                          {data.bureaus.filter((b) => b.received).map((b) => (
                            <tr key={b.code} className="border-t border-hairline">
                              <td className="py-2"><Link to={caseLink({ bureau: b.code, active: '1' })} className="flex items-center gap-2 hover:underline"><span className="size-2 rounded-full" style={{ background: bureauColor(b.code) }} />{b.name}</Link></td>
                              <td className="py-2 text-right">{num(b.pending)}</td>
                              <td className={clsx('py-2 text-right', b.beyond_sla ? 'font-semibold text-critical-text' : 'text-ink-3')}>{num(b.beyond_sla)}</td>
                              <td className="py-2 text-right text-ink-2">{b.avg_pending_age ?? '—'} d</td>
                              <td className="py-2 text-right text-ink-2">{pct(b.disposal_rate)}</td>
                              <td className="py-2 text-right text-ink-2">{pct(b.sla_compliance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <div className="space-y-5">
                    <section className="glass rounded-[24px] p-5">
                      <h2 className="text-base">Region-wise pending</h2>
                      <p className="mb-2 text-xs text-ink-3">Active and overdue cases</p>
                      <BarsChart horizontal height={240} data={data.regions.filter((r) => r.received)} x="code"
                        onClick={(row) => nav(caseLink({ region: String(row.code), active: '1' }))}
                        series={[{ key: 'pending', name: 'Active', color: 'var(--b2)' }, { key: 'beyond_sla', name: 'Overdue', color: 'var(--b1)' }]} />
                    </section>
                    <section className="glass rounded-[24px] p-5">
                      <h2 className="text-base">Pending case ageing</h2>
                      <p className="mb-2 text-xs text-ink-3">Days since receipt</p>
                      <BarsChart height={180} data={data.ageing} x="bucket" xFormatter={(v) => v.replace(' days', '')} series={[{ key: 'total', name: 'Pending cases', color: 'var(--b1)' }]} />
                      <p className="mt-1 text-xs text-ink-3">{num(data.ageing.slice(3).reduce((s, a) => s + Number(a.total), 0))} pending for more than 60 days · <Link className="font-medium text-ink underline-offset-2 hover:underline" to="/reports?type=ageing">Ageing report</Link></p>
                    </section>
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                  <section className="glass rounded-[24px] p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h2 className="text-base">Institution-wise case status</h2>
                        <p className="text-xs text-ink-3">Institutions with the most active complaints</p>
                      </div>
                      <Link to="/institutions" className={pillLink}>All institutions</Link>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-sm">
                        <thead><tr className="text-left text-ink-3">
                          <th className="py-2">Institution</th><th className="py-2">Handled by</th><th className="py-2">Status mix</th>
                          <th className="py-2 text-right">Active</th><th className="py-2 text-right">Overdue</th>
                        </tr></thead>
                        <tbody>
                          {data.topInstitutions.map((t) => (
                            <tr key={t.id} className="border-t border-hairline">
                              <td className="py-2.5 pr-3">
                                <Link to={`/institutions/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                                <div className="text-xs text-ink-3">{t.aicte_id} · {t.city}</div>
                              </td>
                              <td className="py-2.5"><div className="flex flex-wrap items-center gap-1">{t.bureaus.map((b) => <BureauChip key={b} code={b} />)}{t.overlap && <span title="Overlap: multiple Bureaus/Cells" className="flex size-6 items-center justify-center rounded-full bg-critical-soft text-critical-text"><GitMerge className="size-3.5" /></span>}</div></td>
                              <td className="py-2.5"><MiniStack parts={[[t.s_pending, 'Pending'], [t.s_process, 'Under Process'], [t.s_transferred, 'Transferred'], [t.s_escalated, 'Escalated'], [t.s_disposed, 'Disposed']]} /></td>
                              <td className="py-2.5 text-right tnum">{t.active}</td>
                              <td className={clsx('py-2.5 text-right tnum', t.breached ? 'font-semibold text-critical-text' : 'text-ink-3')}>{t.breached}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <div className="space-y-5">
                    <ActivityList data={data} />
                    <OverlapWatch data={data} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const pillLink = 'flex items-center gap-1.5 rounded-[12px] bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-3 hover:text-ink';

function Greeting({ data }: { data: DashboardData }) {
  const { user } = useAuth();
  const time = useClock();
  const [today] = useState(() => new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' }));
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight text-ink sm:text-[34px]">Hello, {firstName(user?.name)}</h1>
        <p className="mt-0.5 text-sm text-ink-3">Welcome back! {data.kpis.not_started ? `${num(data.kpis.not_started)} new complaints are waiting for first action.` : 'Every complaint has been acted upon.'}</p>
      </div>
      <div className="sm:text-right">
        <div className="text-lg font-semibold leading-none text-ink tnum">{time}</div>
        <div className="mt-1 text-xs text-ink-3">{today}</div>
      </div>
    </div>
  );
}

/** The one headline: colleges handled by more than one department. */
function OverlapBanner({ data }: { data: DashboardData }) {
  const o = data.overlaps;
  return (
    <Link to="/overlaps" className="group relative flex min-h-[176px] items-center overflow-hidden rounded-[24px] bg-surface-2 p-6 transition hover:bg-surface-3 sm:p-7">
      <div className="relative z-[1] max-w-md sm:max-w-[58%]">
        <div className="text-xs font-medium text-ink-3">Overlapping colleges · coordination required</div>
        <h2 className="mt-1.5 text-[20px] leading-snug text-ink sm:text-[22px]">{o.open} colleges are being handled by more than one department</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-[14px] bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-ink">Review overlaps <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
          <span className="text-xs text-ink-3">{o.rbPgrc} with both RB and PGRC</span>
        </div>
      </div>
      <OverlapIllustration className="pointer-events-none absolute -right-3 bottom-0 hidden h-[168px] w-auto sm:block" />
    </Link>
  );
}

/** "Top activities" style list: the overdue cases to look at first. A ring shows how late each one is. */
function NeedsAttention() {
  const { data: list } = useQuery({
    queryKey: ['cases', 'focus', 4],
    queryFn: () => api<{ rows: CaseRow[] }>('/cases?active=1&sla=breached&sort=priority&dir=asc&size=4'),
  });
  return (
    <section className="glass flex min-w-0 flex-col rounded-[24px] p-5">
      <h2 className="text-base">Needs attention</h2>
      <p className="text-xs text-ink-3">Overdue cases, most urgent first</p>
      <ul className="mt-3 flex-1 space-y-1">
        {list?.rows.slice(0, 4).map((c) => (
          <li key={c.id}>
            <Link to={`/cases/${c.id}`} className="-mx-2 flex items-center gap-3 rounded-[16px] px-2 py-2.5 transition hover:bg-surface-1">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{c.subject}</div>
                <div className="truncate text-xs text-ink-3">{shortNo(c.case_no)} · {c.institution_name ?? 'Unidentified institution'}</div>
              </div>
              <LateRing days={-c.days_left} />
            </Link>
          </li>
        ))}
        {!list && <Spinner />}
        {list && !list.rows.length && <li className="py-6 text-center text-sm text-ink-3">Nothing is overdue.</li>}
      </ul>
      <Link to="/cases?active=1&sla=breached" className="mt-2 flex items-center justify-center gap-1 rounded-[14px] bg-surface-2 py-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-3 hover:text-ink">
        See all overdue cases <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}

/** Dark disc with a thin ring: the ring fills as a case gets later (full at 90 days). */
function LateRing({ days }: { days: number }) {
  const late = Math.max(0, days);
  const frac = Math.min(1, late / 90);
  const r = 23, C = 2 * Math.PI * r;
  return (
    <span className="relative flex size-[52px] shrink-0 items-center justify-center" title={`${late} days overdue`}>
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="2" />
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} />
      </svg>
      <span className="flex size-[40px] items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink tnum">{late}d</span>
    </span>
  );
}

/** Dark "bank card" with one big number and a few small ones underneath. */
function InkStat({ to, alt, label, value, sub, foot }: { to: string; alt: boolean; label: string; value: number; sub: string; foot: Array<[string, number]> }) {
  return (
    <Link to={to} className={clsx('block rounded-[24px] p-5 shadow-[var(--shadow)] transition hover:-translate-y-0.5', alt ? 'ink-card-alt' : 'ink-card')}>
      <div className="text-xs text-white/75">{label}</div>
      <div className="mt-1 text-[34px] font-medium leading-none tracking-tight tnum">{num(value)}</div>
      <div className="mt-1.5 text-xs text-white/75">{sub}</div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="flex gap-5">
          {foot.map(([l, v]) => (
            <div key={l}>
              <div className="text-[15px] font-medium leading-none tnum">{num(v)}</div>
              <div className="mt-1 text-[10.5px] text-white/65">{l}</div>
            </div>
          ))}
        </div>
        <span className="flex shrink-0" aria-hidden><span className="size-6 rounded-full bg-white/90" /><span className="-ml-2.5 size-6 rounded-full bg-white/45" /></span>
      </div>
    </Link>
  );
}

/** Right column: a single monochrome trend, switchable between received and disposed. */
function TrendCard({ data }: { data: DashboardData }) {
  const c = useTokens();
  const [metric, setMetric] = useState<'received' | 'disposed'>('received');
  const rows = data.trend.slice(-6);
  return (
    <section className="glass rounded-[24px] p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base">Complaints</h2>
        <div className="flex rounded-[12px] bg-surface-2 p-1 text-xs font-medium" role="tablist" aria-label="Series">
          {(['received', 'disposed'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={metric === m} onClick={() => setMetric(m)}
              className={clsx('rounded-[9px] px-2.5 py-1 capitalize transition', metric === m ? 'bg-accent text-accent-ink' : 'text-ink-3 hover:text-ink')}>{m}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-ink-3">Per month · last 6 months</p>
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={rows} margin={{ top: 14, right: 6, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c('var(--ink)')} stopOpacity={0.1} />
              <stop offset="1" stopColor={c('var(--ink)')} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="month" tickFormatter={(v) => monthLabel(v).split(' ')[0]} tickLine={false} axisLine={false} tick={{ fill: c('var(--muted)'), fontSize: 10.5 }} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: c('var(--muted)'), fontSize: 10.5 }} allowDecimals={false} width={44} domain={['dataMin - 10', 'dataMax + 10']} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => monthLabel(String(l))} />} cursor={{ stroke: c('var(--axis)'), strokeWidth: 1 }} />
          <Area type="natural" dataKey={metric} name={metric === 'received' ? 'Received' : 'Disposed'} stroke={c('var(--ink)')} strokeWidth={2.5} fill="url(#trend-wash)"
            dot={false} activeDot={{ r: 6, stroke: c('var(--ink)'), strokeWidth: 3, fill: c('var(--panel-solid)') }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}

/** Right column: disposal-rate donut with a short legend, like the reference's spending ring. */
function DisposalCard({ data, caseLink }: { data: DashboardData; caseLink: (e: Record<string, string>) => string }) {
  const rate = Math.max(0, Math.min(100, data.kpis.disposal_rate ?? 0));
  const r = 62, C = 2 * Math.PI * r, gap = 10;
  const dark = (C * rate) / 100;
  const rows: Array<{ label: string; value: number; dot: string; to: string }> = [
    { label: 'Disposed', value: data.kpis.disposed, dot: 'var(--ink)', to: caseLink({ status: 'Disposed' }) },
    { label: 'Pending', value: data.kpis.pending, dot: 'var(--b2)', to: caseLink({ active: '1' }) },
    { label: 'Overdue', value: data.kpis.beyond_sla, dot: 'var(--critical)', to: caseLink({ sla: 'breached', active: '1' }) },
  ];
  return (
    <section className="glass rounded-[24px] p-5">
      <h2 className="text-base">Disposal rate</h2>
      <p className="text-xs text-ink-3">Share of all complaints closed</p>
      <div className="relative mx-auto my-3 size-[170px]">
        <svg viewBox="0 0 160 160" className="-rotate-90" role="img" aria-label={`${Math.round(rate)}% of complaints disposed`}>
          <circle cx="80" cy="80" r={r} fill="none" stroke="var(--b2)" strokeOpacity=".55" strokeWidth="14" strokeLinecap="round"
            strokeDasharray={`${Math.max(0, C - dark - gap * 2)} ${C}`} strokeDashoffset={-(dark + gap)} />
          <circle cx="80" cy="80" r={r} fill="none" stroke="var(--ink)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${dark} ${C}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[34px] font-medium tracking-tight text-ink tnum">{Math.round(rate)}<span className="text-base">%</span></span>
        </div>
      </div>
      <ul className="space-y-2.5">
        {rows.map((x) => (
          <li key={x.label}>
            <Link to={x.to} className="flex items-center gap-3 text-sm hover:underline">
              <span className="size-2 rounded-full" style={{ background: x.dot }} />
              <span className="flex-1 font-medium text-ink-2">{x.label}</span>
              <span className="font-semibold text-ink tnum">{num(x.value)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Avatar({ label, color }: { label: string; color: string }) {
  return (
    <span className={clsx('flex size-7 items-center justify-center rounded-full font-bold text-ink ring-2 ring-[var(--panel)]', label.length > 3 ? 'text-[7.5px]' : 'text-[9px]')}
      style={{ background: `color-mix(in srgb, ${color} 45%, var(--panel))` }}>{label}</span>
  );
}

function StripKpi({ icon, label, value, sub, to, accent, critical }: { icon: React.ReactNode; label: string; value: number; sub: string; to: string; accent?: boolean; critical?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-[20px] p-3 transition-colors hover:bg-surface-2 sm:p-4">
      <span className={clsx('flex size-12 shrink-0 items-center justify-center rounded-full',
        accent ? 'bg-accent text-accent-ink' : critical ? 'bg-critical-soft text-critical-text' : 'bg-accent-soft text-accent-text')}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-ink-3">{label}</span>
        <span className={clsx('block text-[24px] font-semibold leading-tight tnum', critical && value > 0 && 'text-critical-text')}>{num(value)}</span>
        <span className="block truncate text-[11px] text-ink-3">{sub}</span>
      </span>
    </Link>
  );
}

function MiniKpi({ icon, label, value, sub, to }: { icon: React.ReactNode; label: string; value: number; sub: string; to: string }) {
  return (
    <Link to={to} className="glass flex flex-col rounded-[20px] p-4 transition hover:-translate-y-0.5">
      <span className="flex items-center justify-between text-xs text-ink-3">{label}<span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-accent-text">{icon}</span></span>
      <span className="mt-1 text-xl font-semibold tnum">{num(value)}</span>
      <span className="truncate text-[11px] text-ink-3">{sub}</span>
    </Link>
  );
}

function Goal({ label, value }: { label: string; value: number | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="glass flex min-h-[128px] flex-col justify-between rounded-[20px] p-4">
      <div className="text-[30px] font-light leading-none tracking-tight tnum">{value === null ? '—' : `${Math.round(v)}%`}</div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className="h-full rounded-full bg-sun" style={{ width: `${v}%` }} />
        </div>
        <div className="mt-2 text-xs text-ink-2">{label}</div>
      </div>
    </div>
  );
}

function WorkloadCard({ bureaus, received30, disposed30, onPick }: { bureaus: DashboardData['bureaus']; received30: number; disposed30: number; onPick: (b: string) => void }) {
  const c = useTokens();
  const rows = bureaus.filter((b) => b.pending > 0);
  const total = rows.reduce((s, b) => s + b.pending, 0);
  const peak = Math.max(0, ...rows.map((b) => b.pending));
  const net = received30 - disposed30;
  return (
    <div className="glass flex min-h-[128px] gap-3 rounded-[20px] p-4">
      <div className="flex min-w-0 flex-col justify-between">
        <div className="text-xs text-ink-3">Active cases</div>
        <div className="text-[28px] font-semibold leading-none tnum">{num(total)}</div>
        <span className={clsx('w-fit rounded-full px-2 py-0.5 text-[11px] font-medium', net > 0 ? 'bg-warning-soft text-warning-text' : 'bg-good-soft text-good-text')}>
          {net > 0 ? '↑' : '↓'} {Math.abs(net)} net in 30 days
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <ResponsiveContainer width="100%" height={104}>
          <BarChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
            <defs>
              <pattern id="wl-stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={c('var(--sun)')} /><rect width="2.2" height="6" fill="#ffffff" opacity=".4" />
              </pattern>
            </defs>
            <XAxis dataKey="code" tickLine={false} axisLine={false} tick={{ fill: c('var(--muted)'), fontSize: 10 }} interval={0} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: c('var(--surface-2)'), radius: 6 }} />
            <Bar dataKey="pending" name="Active cases" radius={[6, 6, 6, 6]} maxBarSize={20} isAnimationActive={false} style={{ cursor: 'pointer' }}
              onClick={(d: unknown) => onPick(String((d as { payload: { code: string } }).payload.code))}>
              {rows.map((r) => <Cell key={r.code} fill={r.pending === peak ? 'url(#wl-stripes)' : c('var(--surface-3)')} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ActivityList({ data }: { data: DashboardData }) {
  const live = useLive();
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-base text-ink">Live activity</h2>
        <span className="flex items-center gap-1.5 text-xs text-ink-3"><span className={clsx('size-2 rounded-full', live.connected ? 'live-dot bg-good' : 'bg-muted')} />{live.connected ? 'Live' : 'Offline'}</span>
      </div>
      <div className="space-y-2.5">
        {data.recent.slice(0, 4).map((a) => {
          const b = a.to_bureau ?? a.bureau_code;
          const fresh = live.events.some((e) => e.case_id === a.case_id && Date.now() - new Date(e.at).getTime() < 15000);
          return (
            <Link key={a.id} to={`/cases/${a.case_id}`} className={clsx('glass block rounded-[20px] p-3.5 transition hover:-translate-y-0.5', fresh && 'flash')}>
              <div className="flex items-center gap-3">
                <Avatar label={b} color={bureauColor(b)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{shortNo(a.case_no)}</div>
                  <div className="truncate text-xs text-ink-3">{a.institution_name ?? 'Unidentified institution'}</div>
                </div>
                <span className={clsx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                  a.action_type === 'DISPOSE' ? 'bg-good-soft text-good-text' : a.action_type === 'ESCALATE' ? 'bg-critical-soft text-critical-text' : 'bg-accent-soft text-accent-text')}>
                  {ACTION_VERB[a.action_type] ?? a.action_type}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3">
                <span title={fmtDateTime(a.at)}><Clock className="mr-1 inline size-3" />{relTime(a.at)}</span>
                <span className="truncate pl-2">{a.actor_name ?? 'System'}</span>
              </div>
            </Link>
          );
        })}
        <Link to="/cases" className="glass flex items-center justify-between rounded-[20px] px-4 py-3.5 text-sm font-medium hover:text-accent-text">
          See all cases <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function OverlapWatch({ data }: { data: DashboardData }) {
  if (!data.overlaps.top.length) return null;
  return (
    <section className="glass rounded-[24px] p-5">
      <h2 className="text-base">Overlap watch</h2>
      <p className="mb-3 text-xs text-ink-3">Parallel action by multiple Bureaus/Cells</p>
      <ul className="space-y-2">
        {data.overlaps.top.slice(0, 3).map((o) => (
          <li key={o.institution_id}>
            <Link to={`/overlaps#inst-${o.institution_id}`} className="tile block rounded-2xl p-3 hover:bg-surface-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium leading-snug">{o.institution?.name}</span>
                <SeverityBadge severity={o.severity} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">{o.bureaus.map((b) => <BureauChip key={b} code={b} />)}<span>· {o.cases} cases</span></div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-ink-3">Updated {fmtDate(data.generated_at)}</p>
    </section>
  );
}

function MiniStack({ parts }: { parts: Array<[number, string]> }) {
  const total = parts.reduce((s, [n]) => s + n, 0) || 1;
  return (
    <div className="flex h-2 w-28 gap-[2px] overflow-hidden rounded-full" title={parts.filter(([n]) => n).map(([n, s]) => `${s}: ${n}`).join(' · ')}>
      {parts.map(([n, s]) => n > 0 && <div key={s} style={{ width: `${(n / total) * 100}%`, background: STATUS_COLOR[s] }} className="rounded-full" />)}
    </div>
  );
}
