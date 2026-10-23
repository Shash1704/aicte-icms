import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertOctagon, AlertTriangle, ArrowRight, ArrowRightLeft, ArrowUpRight, Bell, CheckCircle2, Clock, Download, Files, Flag, GitMerge,
  Hourglass, MessageSquare, Paperclip, Plus, TrendingUp,
} from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { api, openDocument, qs } from '../lib/api';
import { useAuth, useLive, useLookups } from '../lib/context';
import { bytes, fmtDate, fmtDateTime, monthLabel, num, pct, relTime } from '../lib/format';
import { bureauColor, STATUS_COLOR } from '../lib/colors';
import { BarsChart, ChartTooltip, LinesChart, useTokens } from '../components/charts';
import { BureauChip, ErrorBox, SeverityBadge, Spinner } from '../components/ui';
import { ScopeFilters, useFilterParams } from '../components/FilterBar';
import { CoordinationIllustration, DeadlineIllustration } from '../components/Illustrations';
import type { CaseDetail, CaseRow, Severity } from '../lib/types';

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

const istHour = () => Number(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
const greeting = () => { const h = istHour(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const firstName = (n?: string) => (n ?? '').replace(/^(Prof\.|Dr\.)\s*/, '').split(' ')[0];
const initials = (name?: string | null) => (name ?? '').replace(/^(Prof\.|Dr\.)\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const shortNo = (no: string) => no.replace('AICTE/', '');
const ddmmyyyy = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

/** Live IST clock, formatted like the reference ("10.29 am"). */
function useClock() {
  const fmt = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).replace(':', '.').toLowerCase();
  const [t, setT] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setT(fmt()), 15_000); return () => clearInterval(id); }, []);
  return t;
}

export default function Dashboard() {
  const { values } = useFilterParams();
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard', values], queryFn: () => api<DashboardData>(`/dashboard${qs(values)}`), refetchInterval: 60000 });
  const caseLink = (extra: Record<string, string>) => `/cases${qs({ ...values, ...extra })}`;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-medium tracking-tight text-ink">Monitoring Dashboard</h1>
        <ScopeFilters />
      </div>
      <ErrorBox error={error} />
      {isLoading || !data ? <Spinner /> : (
        <div className="space-y-6">
          {/* Row 1: greeting + overlap "weather" card */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_270px]">
            <div className="min-w-0 xl:col-span-2"><GreetingCard data={data} /></div>
            <OverlapCard data={data} />
          </div>

          {/* Row 2: Open → Description → Status */}
          <CaseFocus />

          {/* Row 3: the numbers the problem statement asks for */}
          <section>
            <h2 className="mb-3 text-lg font-normal text-ink-2">Overview</h2>
            <div className="glass grid grid-cols-2 gap-1.5 rounded-[26px] p-2 lg:grid-cols-4">
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

          {/* Row 4: statistics + goals/workload */}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="glass rounded-[26px] p-5">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium tracking-tight">Statistics</h2>
                  <p className="text-xs text-ink-3">Complaints received vs disposed · last 12 months</p>
                </div>
                <Link to="/reports?type=performance" className="tile flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-ink-2 hover:text-ink">Performance report <ArrowUpRight className="size-3.5" /></Link>
              </div>
              <LinesChart height={270} data={data.trend} x="month" xFormatter={monthLabel}
                series={[{ key: 'received', name: 'Received', color: 'var(--b1)' }, { key: 'disposed', name: 'Disposed', color: 'var(--b2)' }]} />
            </section>
            <div className="space-y-5">
              <section>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-lg font-normal text-ink-2">Performance goals</h2>
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
                  <h2 className="text-lg font-normal text-ink-2">Bureau/Cell workload</h2>
                  <Link to={caseLink({ active: '1' })} className="text-xs font-medium text-ink-3 hover:text-ink">Open cases</Link>
                </div>
                <WorkloadCard bureaus={data.bureaus} received30={data.kpis.received_30d} disposed30={data.kpis.disposed_30d} onPick={(b) => nav(caseLink({ bureau: b, active: '1' }))} />
              </section>
            </div>
          </div>

          {/* Row 5: status by Bureau, regions, ageing */}
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className="glass rounded-[26px] p-5">
              <h2 className="text-lg font-medium tracking-tight">Active cases by Bureau/Cell</h2>
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
                  <thead><tr className="text-left text-xs text-ink-3">
                    <th className="py-2 font-medium">Bureau/Cell</th><th className="py-2 text-right font-medium">Active</th><th className="py-2 text-right font-medium">Overdue</th>
                    <th className="py-2 text-right font-medium">Avg. age</th><th className="py-2 text-right font-medium">Disposal</th><th className="py-2 text-right font-medium">On time</th>
                  </tr></thead>
                  <tbody className="tnum">
                    {data.bureaus.filter((b) => b.received).map((b) => (
                      <tr key={b.code} className="border-t border-hairline">
                        <td className="py-2"><Link to={caseLink({ bureau: b.code, active: '1' })} className="flex items-center gap-2 hover:text-accent-text"><span className="size-2 rounded-full" style={{ background: bureauColor(b.code) }} />{b.name}</Link></td>
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
              <section className="glass rounded-[26px] p-5">
                <h2 className="text-lg font-medium tracking-tight">Region-wise pending</h2>
                <p className="mb-2 text-xs text-ink-3">Active and overdue cases</p>
                <BarsChart horizontal height={240} data={data.regions.filter((r) => r.received)} x="code"
                  onClick={(row) => nav(caseLink({ region: String(row.code), active: '1' }))}
                  series={[{ key: 'pending', name: 'Active', color: 'var(--b1)' }, { key: 'beyond_sla', name: 'Overdue', color: 'var(--b2)' }]} />
              </section>
              <section className="glass rounded-[26px] p-5">
                <h2 className="text-lg font-medium tracking-tight">Pending case ageing</h2>
                <p className="mb-2 text-xs text-ink-3">Days since receipt</p>
                <BarsChart height={180} data={data.ageing} x="bucket" xFormatter={(v) => v.replace(' days', '')} series={[{ key: 'total', name: 'Pending cases', color: 'var(--b1)' }]} />
                <p className="mt-1 text-xs text-ink-3">{num(data.ageing.slice(3).reduce((s, a) => s + Number(a.total), 0))} pending for more than 60 days · <Link className="font-medium text-accent-text hover:underline" to="/reports?type=ageing">Ageing report</Link></p>
              </section>
            </div>
          </div>

          {/* Row 6: institutions + activity */}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="glass rounded-[26px] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium tracking-tight">Institution-wise case status</h2>
                  <p className="text-xs text-ink-3">Institutions with the most active complaints</p>
                </div>
                <Link to="/institutions" className="tile rounded-full px-3.5 py-1.5 text-xs font-medium text-ink-2 hover:text-ink">All institutions</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead><tr className="text-left text-xs text-ink-3">
                    <th className="py-2 font-medium">Institution</th><th className="py-2 font-medium">Handled by</th><th className="py-2 font-medium">Status mix</th>
                    <th className="py-2 text-right font-medium">Active</th><th className="py-2 text-right font-medium">Overdue</th>
                  </tr></thead>
                  <tbody>
                    {data.topInstitutions.map((t) => (
                      <tr key={t.id} className="border-t border-hairline">
                        <td className="py-2.5 pr-3">
                          <Link to={`/institutions/${t.id}`} className="font-medium hover:text-accent-text">{t.name}</Link>
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
  );
}

function GreetingCard({ data }: { data: DashboardData }) {
  const { user } = useAuth();
  const time = useClock();
  return (
    <section className="glass relative flex min-h-[200px] items-center overflow-hidden rounded-[30px] p-6 sm:p-7">
      <div className="relative z-[1] min-w-0 flex-1">
        <h2 className="text-2xl font-normal tracking-tight text-ink sm:text-[26px]">{greeting()}, {firstName(user?.name)}</h2>
        <p className="mt-1 text-sm text-ink-3">{data.kpis.not_started ? `${num(data.kpis.not_started)} new complaints are waiting for first action.` : 'Every complaint has been acted upon.'}</p>
        <p className="mt-6 text-5xl font-light tracking-tight text-ink tnum sm:text-[56px]">{time}</p>
      </div>
      <CoordinationIllustration className="pointer-events-none absolute -bottom-2 right-4 hidden h-[150px] w-auto md:block lg:hidden xl:right-8 xl:block xl:h-[190px]" />
    </section>
  );
}

/** The reference's weather card, as the overlap headline. */
function OverlapCard({ data }: { data: DashboardData }) {
  const o = data.overlaps;
  return (
    <Link to="/overlaps" className="glass group flex min-h-[200px] flex-col justify-between rounded-[30px] p-6 transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <OverlapGlyph />
        <span className="text-[52px] font-light leading-none tracking-tight tnum">{o.open}</span>
      </div>
      <div>
        <div className="text-lg font-medium text-ink">Overlapping colleges</div>
        <div className="mt-0.5 text-xs text-ink-3">{o.rbPgrc} with RB + PGRC · Coordination Required</div>
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-accent-text">Review overlaps <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></div>
      </div>
    </Link>
  );
}

function OverlapGlyph() {
  return (
    <svg viewBox="0 0 72 56" className="h-14 w-auto" aria-hidden>
      <circle cx="26" cy="28" r="20" fill="#7461ee" opacity=".55" />
      <circle cx="46" cy="28" r="20" fill="#b4a9ff" opacity=".55" />
      <path d="M36 11.5a20 20 0 0 1 0 33 20 20 0 0 1 0-33z" fill="#f2efff" opacity=".9" />
      <path d="M33 22l3-4 3 4m-3-4v14" stroke="#7461ee" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Row 2: pick a case on the left, see its description in the middle and its deadline on the right. */
function CaseFocus() {
  const { data: list } = useQuery({
    queryKey: ['cases', 'focus'],
    queryFn: () => api<{ rows: CaseRow[] }>('/cases?active=1&sla=breached&sort=priority&dir=asc&size=3'),
  });
  const [picked, setPicked] = useState<number | null>(null);
  const selectedId = picked ?? list?.rows[0]?.id ?? null;
  const { data: detail } = useQuery({ queryKey: ['case', String(selectedId)], enabled: !!selectedId, queryFn: () => api<CaseDetail>(`/cases/${selectedId}`) });
  const nav = useNavigate();

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_270px]">
      <section className="min-w-0">
        <h2 className="mb-3 text-lg font-normal text-ink-2">Needs attention</h2>
        <div className="glass space-y-3 rounded-[26px] p-4">
          {list?.rows.map((c) => (
            <button key={c.id} onClick={() => setPicked(c.id)} onDoubleClick={() => nav(`/cases/${c.id}`)}
              className={clsx('flex w-full gap-3 rounded-[20px] border-2 p-3.5 text-left transition',
                c.id === selectedId ? 'border-select-border bg-select' : 'border-[var(--hairline)] hover:border-accent')}>
              <div className="flex flex-col items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent-text"><Bell className="size-4" /></span>
                <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-ink-3"><Paperclip className="size-4" /></span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">#{shortNo(c.case_no)}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3"><CheckCircle2 className="size-3.5" />{c.status} · {c.days_left < 0 ? `${-c.days_left}d overdue` : `${c.days_left}d left`}</div>
                <div className="mt-2 flex items-center gap-1">
                  <Avatar label={c.bureau_code} color={bureauColor(c.bureau_code)} />
                  {c.officer_name && <Avatar label={initials(c.officer_name)} color="var(--b2)" />}
                  {c.overlap && <span title="Overlap with another Bureau/Cell" className="flex size-7 items-center justify-center rounded-full bg-critical-soft text-critical-text"><GitMerge className="size-3.5" /></span>}
                </div>
                <div className="mt-1.5 text-xs text-ink-3 tnum">{ddmmyyyy(c.received_on)}</div>
              </div>
            </button>
          ))}
          {!list && <Spinner />}
          <Link to="/cases/new" className="flex w-full items-center justify-center gap-1.5 rounded-[18px] border-2 border-[var(--accent)] py-3 text-sm font-medium text-accent-text transition hover:bg-accent-soft">
            <Plus className="size-4" />Register complaint
          </Link>
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="mb-3 text-lg font-normal text-ink-2">Description</h2>
        <div className="glass min-h-[300px] rounded-[26px] p-5">
          {!detail ? <Spinner /> : <CaseDescription c={detail} />}
        </div>
      </section>

      <section className="min-w-0 lg:col-span-2 xl:col-span-1">
        <h2 className="mb-3 text-lg font-normal text-ink-2">Status</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="glass rounded-[26px] p-5 text-center">{detail ? <Countdown c={detail} /> : <Spinner />}</div>
          <DeadlineIllustration className="mx-auto hidden h-[170px] w-auto sm:block" />
        </div>
      </section>
    </div>
  );
}

function CaseDescription({ c }: { c: CaseDetail }) {
  const { categoryName } = useLookups();
  const last = [...c.actions].reverse().find((a) => a.remarks && a.action_type !== 'ASSIGNED');
  const bureaus = c.overlap ? c.overlap.bureaus : [c.bureau_code];
  return (
    <div className="text-sm">
      <Link to={`/cases/${c.id}`} className="text-lg font-semibold text-ink hover:text-accent-text">#{shortNo(c.case_no)}</Link>
      <p className="mt-1 font-medium text-ink-2">{c.subject}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-3">{c.description}</p>

      <Row icon={<Flag className="size-4" />}>
        <span className={clsx('font-medium', c.priority === 'Critical' || c.priority === 'High' ? 'text-critical-text' : 'text-ink-2')}>{c.priority} priority</span>
        <span className="ml-auto text-xs text-ink-3">{categoryName(c.category)}</span>
      </Row>
      <Row icon={<CheckCircle2 className="size-4" />}>
        <span className="min-w-0 truncate text-ink-2">{c.last_action}</span>
        <span className="ml-auto shrink-0 text-xs text-ink-3 tnum">{ddmmyyyy(c.last_action_on)}</span>
      </Row>
      <div className="mt-2 flex items-center justify-end gap-1.5 pl-11">
        <Link to={`/cases/${c.id}`} className="flex size-7 items-center justify-center rounded-full border border-dashed border-[var(--axis)] text-ink-3 hover:text-ink" title="Open case"><Plus className="size-3.5" /></Link>
        {bureaus.map((b) => <Avatar key={b} label={b} color={bureauColor(b)} />)}
      </div>

      <div className="mt-4 border-t border-hairline pt-3">
        <Row icon={<Paperclip className="size-4" />} className="mt-0"><span className="text-ink-2">Attachments</span></Row>
        <div className="mt-2 flex justify-end gap-2">
          <Link to={`/cases/${c.id}`} className="flex size-12 items-center justify-center rounded-xl border-2 border-dashed border-[var(--axis)] text-ink-3 hover:text-ink" title="Add a document on the case page"><Plus className="size-4" /></Link>
          {c.documents.slice(-2).map((d) => (
            <button key={d.id} onClick={() => openDocument(d.id).catch(() => {})} title={d.filename} className="flex flex-col items-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-select text-accent-text hover:brightness-110"><Download className="size-4" /></span>
              <span className="mt-1 text-[10px] text-ink-3">{bytes(d.size)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-hairline pt-3">
        <Row icon={<MessageSquare className="size-4" />} className="mt-0">
          <span className="text-ink-2">Latest remark</span>
          {last && <span className="ml-auto text-[10px] text-ink-3 tnum">{ddmmyyyy(last.at)}</span>}
        </Row>
        {last && (
          <div className="mt-2 flex items-start gap-2 rounded-2xl bg-surface-2 p-2.5 pl-11">
            <span className="-ml-8 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#b4a9ff] to-[#6450e6] text-[10px] font-bold text-white">{initials(last.actor_name)}</span>
            <span className="line-clamp-2 text-xs text-ink-2">{last.remarks}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('mt-3 flex items-center gap-3', className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">{icon}</span>
      {children}
    </div>
  );
}

function Avatar({ label, color }: { label: string; color: string }) {
  return (
    <span className={clsx('flex size-7 items-center justify-center rounded-full font-bold text-ink ring-2 ring-[var(--panel)]', label.length > 3 ? 'text-[7.5px]' : 'text-[9px]')}
      style={{ background: `color-mix(in srgb, ${color} 45%, var(--panel))` }}>{label}</span>
  );
}

/** Dashed countdown ring: one tick per day of the prescribed timeline. */
function Countdown({ c }: { c: CaseDetail }) {
  const total = Math.max(1, c.sla.total);
  const ticks = 40;
  const used = Math.min(1, Math.max(0, c.sla.age / total));
  const overdue = c.sla.daysLeft < 0;
  const color = overdue ? 'var(--critical)' : c.sla.state === 'approaching' ? 'var(--warning)' : 'var(--accent)';
  return (
    <div>
      <div className="text-sm font-medium text-ink-2">{c.status}</div>
      <svg viewBox="0 0 140 140" className="mx-auto my-2 size-40" role="img" aria-label={`${Math.abs(c.sla.daysLeft)} days ${overdue ? 'overdue' : 'left'}`}>
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
          const on = i / ticks < (overdue ? 1 : 1 - used);
          return <line key={i} x1={70 + Math.cos(a) * 54} y1={70 + Math.sin(a) * 54} x2={70 + Math.cos(a) * 62} y2={70 + Math.sin(a) * 62}
            stroke={on ? color : 'var(--axis)'} strokeWidth="3" strokeLinecap="round" />;
        })}
        <text x="70" y="74" textAnchor="middle" fontSize="44" fontWeight="300" fill="var(--ink)">{Math.abs(c.sla.daysLeft)}</text>
        <text x="70" y="96" textAnchor="middle" fontSize="11" fill="var(--ink-3)">{overdue ? 'Days overdue' : 'Days left'}</text>
      </svg>
      <div className="text-xs text-ink-3">Due date: <span className="tnum">{ddmmyyyy(c.expected_disposal)}</span></div>
    </div>
  );
}

function StripKpi({ icon, label, value, sub, to, accent, critical }: { icon: React.ReactNode; label: string; value: number; sub: string; to: string; accent?: boolean; critical?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-[20px] p-3 transition-colors hover:bg-surface-2 sm:p-4">
      <span className={clsx('flex size-12 shrink-0 items-center justify-center rounded-full',
        accent ? 'bg-accent text-accent-ink shadow-[0_10px_24px_-10px_var(--accent)]' : critical ? 'bg-critical-soft text-critical-text' : 'bg-accent-soft text-accent-text')}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-ink-3">{label}</span>
        <span className={clsx('block text-2xl font-medium leading-tight tracking-tight tnum', critical && value > 0 && 'text-critical-text')}>{num(value)}</span>
        <span className="block truncate text-[11px] text-ink-3">{sub}</span>
      </span>
    </Link>
  );
}

function MiniKpi({ icon, label, value, sub, to }: { icon: React.ReactNode; label: string; value: number; sub: string; to: string }) {
  return (
    <Link to={to} className="glass flex flex-col rounded-[22px] p-4 transition hover:-translate-y-0.5">
      <span className="flex items-center justify-between text-xs text-ink-3">{label}<span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-accent-text">{icon}</span></span>
      <span className="mt-1 text-xl font-medium tracking-tight tnum">{num(value)}</span>
      <span className="truncate text-[11px] text-ink-3">{sub}</span>
    </Link>
  );
}

function Goal({ label, value }: { label: string; value: number | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="glass flex min-h-[128px] flex-col justify-between rounded-[22px] p-4">
      <div className="text-[26px] font-light leading-none tracking-tight tnum">{value === null ? '—' : `${Math.round(v)}%`}</div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#b4a9ff] to-[var(--accent)]" style={{ width: `${v}%` }} />
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
  const net = received30 - disposed30;
  return (
    <div className="glass flex min-h-[128px] gap-3 rounded-[22px] p-4">
      <div className="flex min-w-0 flex-col justify-between">
        <div className="text-xs text-ink-3">Active cases</div>
        <div className="text-[26px] font-light leading-none tracking-tight tnum">{num(total)}</div>
        <span className={clsx('w-fit rounded-full px-2 py-0.5 text-[11px] font-medium', net > 0 ? 'bg-warning-soft text-warning-text' : 'bg-good-soft text-good-text')}>
          {net > 0 ? '↑' : '↓'} {Math.abs(net)} net in 30 days
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <ResponsiveContainer width="100%" height={104}>
          <BarChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
            <defs>
              <linearGradient id="wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b4a9ff" /><stop offset="100%" stopColor={c('var(--accent)')} /></linearGradient>
            </defs>
            <XAxis dataKey="code" tickLine={false} axisLine={false} tick={{ fill: c('var(--muted)'), fontSize: 10 }} interval={0} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: c('var(--surface-2)'), radius: 6 }} />
            <Bar dataKey="pending" name="Active cases" fill="url(#wl)" radius={[6, 6, 6, 6]} maxBarSize={20} isAnimationActive={false} style={{ cursor: 'pointer' }}
              onClick={(d: unknown) => onPick(String((d as { payload: { code: string } }).payload.code))} />
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
        <h2 className="text-lg font-normal text-ink-2">Live activity</h2>
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
    <section className="glass rounded-[26px] p-5">
      <h2 className="text-lg font-medium tracking-tight">Overlap watch</h2>
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
