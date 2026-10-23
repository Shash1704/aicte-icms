import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertOctagon, AlertTriangle, ArrowRight, ArrowRightLeft, ArrowUpRight, BarChart3, Bell, CheckCircle2, Clock, FilePlus2, Files, FolderKanban,
  GitMerge, Hourglass, MoreVertical, TrendingUp,
} from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth, useLive, useLookups } from '../lib/context';
import { fmtDate, fmtDateTime, monthLabel, num, pct, relTime } from '../lib/format';
import { bureauColor, STATUS_COLOR } from '../lib/colors';
import { BarsChart, LinesChart, useTokens } from '../components/charts';
import { BureauChip, ErrorBox, SeverityBadge, Spinner } from '../components/ui';
import { ScopeFilters, useFilterParams } from '../components/FilterBar';
import type { Severity } from '../lib/types';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ChartTooltip } from '../components/charts';

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

const greeting = () => {
  const h = Number(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const firstName = (n?: string) => (n ?? '').replace(/^(Prof\.|Dr\.)\s*/, '').split(' ')[0];
const initials = (name?: string) => (name ?? '').replace(/^(Prof\.|Dr\.)\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function Dashboard() {
  const { values } = useFilterParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard', values], queryFn: () => api<DashboardData>(`/dashboard${qs(values)}`), refetchInterval: 60000 });
  const caseLink = (extra: Record<string, string>) => `/cases${qs({ ...values, ...extra })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">{greeting()}, {firstName(user?.name)}</p>
          <h1 className="mt-0.5 flex items-center gap-2.5 text-[28px] font-bold tracking-tight sm:text-[32px]">
            Monitoring Dashboard
            <span className="flex size-9 items-center justify-center rounded-2xl bg-accent-soft text-accent-text"><BarChart3 className="size-5" /></span>
          </h1>
          {data && <p className="mt-1 text-xs text-ink-3">Consolidated view across {user?.role === 'regional' ? 'your region' : 'all Bureaus/Cells'} · updated {fmtDateTime(data.generated_at)}</p>}
        </div>
        <ScopeFilters />
      </div>
      <ErrorBox error={error} />
      {isLoading || !data ? <Spinner /> : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            {data.overlaps.open > 0 && (
              <Link to="/overlaps" className="glass group flex items-center gap-4 rounded-[28px] px-5 py-4 ring-1 ring-critical/35 transition hover:ring-critical/60">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-critical-soft text-critical-text"><GitMerge className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-critical-text">Potential Overlapping Cases – Coordination Required</div>
                  <div className="text-sm text-ink-2">
                    {data.overlaps.open} institution{data.overlaps.open === 1 ? '' : 's'} with active complaints in more than one Bureau/Cell
                    {data.overlaps.rbPgrc > 0 && <> · {data.overlaps.rbPgrc} involve both <b>RB</b> and <b>PGRC</b></>}
                  </div>
                </div>
                <span className="hidden items-center gap-1 rounded-full bg-critical px-4 py-2 text-sm font-semibold text-white sm:flex">Review <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
              </Link>
            )}

            {/* Primary KPI strip */}
            <div className="glass grid grid-cols-2 gap-1.5 rounded-[28px] p-2 lg:grid-cols-4">
              <StripKpi to={caseLink({})} icon={<Files className="size-5" />} label="Total received" value={data.kpis.received} sub={`+${num(data.kpis.received_30d)} in 30 days`} />
              <StripKpi to={caseLink({ active: '1' })} icon={<Hourglass className="size-5" />} label="Pending" value={data.kpis.pending} sub={`${num(data.kpis.not_started)} yet to be acted upon`} accent />
              <StripKpi to={caseLink({ status: 'Disposed' })} icon={<CheckCircle2 className="size-5" />} label="Disposed" value={data.kpis.disposed} sub={`${pct(data.kpis.disposal_rate)} disposal rate`} />
              <StripKpi to={caseLink({ sla: 'breached' })} icon={<AlertTriangle className="size-5" />} label="Beyond timeline" value={data.kpis.beyond_sla} sub={`${num(data.kpis.approaching)} due within 7 days`} critical />
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniKpi to={caseLink({ status: 'Under Process' })} icon={<TrendingUp className="size-4" />} label="Under process" value={data.kpis.under_process} sub={`avg. age ${data.kpis.avg_pending_age ?? '—'} days`} />
              <MiniKpi to={caseLink({ status: 'Transferred' })} icon={<ArrowRightLeft className="size-4" />} label="Transferred" value={data.kpis.transferred} sub={`${num(data.kpis.transferred_now)} awaiting acceptance`} />
              <MiniKpi to={caseLink({ status: 'Escalated' })} icon={<AlertOctagon className="size-4" />} label="Escalated" value={data.kpis.escalated} sub={`${num(data.kpis.escalated_now)} awaiting direction`} />
              <MiniKpi to="/overlaps" icon={<GitMerge className="size-4" />} label="Overlapping institutions" value={data.overlaps.open + data.overlaps.acknowledged + data.overlaps.coordinated} sub={`${num(data.overlaps.open)} open · ${num(data.overlaps.coordinated)} coordinated`} />
            </div>

            {/* Statistic */}
            <section className="glass rounded-[28px] p-5">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Statistics</h2>
                  <p className="text-xs text-ink-3">Complaints received vs disposed · last 12 months</p>
                </div>
                <Link to="/reports?type=performance" className="tile flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-2 hover:text-ink">Performance report <ArrowUpRight className="size-3.5" /></Link>
              </div>
              <LinesChart height={280} data={data.trend} x="month" xFormatter={monthLabel}
                series={[{ key: 'received', name: 'Received', color: 'var(--b1)' }, { key: 'disposed', name: 'Disposed', color: 'var(--b2)' }]} />
            </section>

            {/* Goals + workload */}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <section>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-lg font-semibold tracking-tight">Performance goals</h2>
                  <Link to="/reports?type=disposal" className="text-xs font-semibold text-ink-3 hover:text-ink">All reports +</Link>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Goal label="Disposal rate" value={data.kpis.disposal_rate} />
                  <Goal label="Disposed on time" value={data.kpis.sla_compliance} />
                  <Goal label="Overlaps coordinated" value={(() => { const t = data.overlaps.open + data.overlaps.acknowledged + data.overlaps.coordinated; return t ? Math.round((data.overlaps.coordinated / t) * 100) : 100; })()} />
                </div>
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-lg font-semibold tracking-tight">Bureau/Cell workload</h2>
                  <Link to={caseLink({ active: '1' })} className="text-xs font-semibold text-ink-3 hover:text-ink">Open cases</Link>
                </div>
                <WorkloadCard bureaus={data.bureaus} received30={data.kpis.received_30d} disposed30={data.kpis.disposed_30d} onPick={(b) => nav(caseLink({ bureau: b, active: '1' }))} />
              </section>
            </div>

            {/* Detail: status by Bureau, regions */}
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <section className="glass rounded-[28px] p-5">
                <h2 className="text-lg font-semibold tracking-tight">Active cases by Bureau/Cell</h2>
                <p className="mb-3 text-xs text-ink-3">Current status · click a bar to open those cases</p>
                <BarsChart horizontal stacked height={260} data={data.bureaus.filter((b) => b.received)} x="code"
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
                <section className="glass rounded-[28px] p-5">
                  <h2 className="text-lg font-semibold tracking-tight">Region-wise pending</h2>
                  <p className="mb-2 text-xs text-ink-3">Active and overdue cases</p>
                  <BarsChart horizontal height={250} data={data.regions.filter((r) => r.received)} x="code"
                    onClick={(row) => nav(caseLink({ region: String(row.code), active: '1' }))}
                    series={[{ key: 'pending', name: 'Active', color: 'var(--b1)' }, { key: 'beyond_sla', name: 'Overdue', color: 'var(--b2)' }]} />
                </section>
                <section className="glass rounded-[28px] p-5">
                  <h2 className="text-lg font-semibold tracking-tight">Pending case ageing</h2>
                  <p className="mb-2 text-xs text-ink-3">Days since receipt</p>
                  <BarsChart height={190} data={data.ageing} x="bucket" xFormatter={(v) => v.replace(' days', '')} series={[{ key: 'total', name: 'Pending cases', color: 'var(--b1)' }]} />
                  <p className="mt-1 text-xs text-ink-3">{num(data.ageing.slice(3).reduce((s, a) => s + Number(a.total), 0))} pending for more than 60 days · <Link className="font-semibold text-accent-text hover:underline" to="/reports?type=ageing">Ageing report</Link></p>
                </section>
              </div>
            </div>

            {/* Institution-wise */}
            <section className="glass rounded-[28px] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Institution-wise case status</h2>
                  <p className="text-xs text-ink-3">Institutions with the most active complaints</p>
                </div>
                <Link to="/institutions" className="tile rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-2 hover:text-ink">All institutions</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="text-left text-xs text-ink-3">
                    <th className="py-2 font-medium">Institution</th><th className="py-2 font-medium">Handled by</th><th className="py-2 font-medium">Status mix</th>
                    <th className="py-2 text-right font-medium">Active</th><th className="py-2 text-right font-medium">Overdue</th>
                  </tr></thead>
                  <tbody>
                    {data.topInstitutions.map((t) => (
                      <tr key={t.id} className="border-t border-hairline">
                        <td className="py-2.5 pr-3">
                          <Link to={`/institutions/${t.id}`} className="font-semibold hover:text-accent-text">{t.name}</Link>
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
          </div>

          {/* Right column */}
          <aside className="space-y-5 xl:sticky xl:top-24">
            <ProfileCard data={data} />
            <ActivityList data={data} />
            <OverlapWatch data={data} />
          </aside>
        </div>
      )}
    </div>
  );
}

function StripKpi({ icon, label, value, sub, to, accent, critical }: { icon: React.ReactNode; label: string; value: number; sub: string; to: string; accent?: boolean; critical?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-[22px] p-3 transition-colors hover:bg-surface-2 sm:p-4">
      <span className={clsx('flex size-12 shrink-0 items-center justify-center rounded-full',
        accent ? 'bg-accent text-accent-ink shadow-[0_10px_24px_-10px_var(--accent)]' : critical ? 'bg-critical-soft text-critical-text' : 'tile text-ink')}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-ink-3">{label}</span>
        <span className={clsx('block text-2xl font-bold leading-tight tracking-tight tnum', critical && value > 0 && 'text-critical-text')}>{num(value)}</span>
        <span className="block truncate text-[11px] text-ink-3">{sub}</span>
      </span>
    </Link>
  );
}

function MiniKpi({ icon, label, value, sub, to }: { icon: React.ReactNode; label: string; value: number; sub: string; to: string }) {
  return (
    <Link to={to} className="glass flex flex-col rounded-[22px] p-4 transition hover:-translate-y-0.5">
      <span className="flex items-center justify-between text-xs text-ink-3">{label}<span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-ink-2">{icon}</span></span>
      <span className="mt-1 text-xl font-bold tracking-tight tnum">{num(value)}</span>
      <span className="truncate text-[11px] text-ink-3">{sub}</span>
    </Link>
  );
}

function Goal({ label, value }: { label: string; value: number | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="glass flex min-h-[132px] flex-col justify-between rounded-[22px] p-4">
      <div className="text-[26px] font-bold leading-none tracking-tight tnum">{value === null ? '—' : `${Math.round(v)}%`}</div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#ffb36b] to-[var(--accent)]" style={{ width: `${v}%` }} />
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
    <div className="glass flex min-h-[132px] gap-3 rounded-[22px] p-4">
      <div className="flex min-w-0 flex-col justify-between">
        <div className="text-xs text-ink-3">Active cases</div>
        <div className="text-[26px] font-bold leading-none tracking-tight tnum"><span className="text-accent-text">#</span> {num(total)}</div>
        <span className={clsx('w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold', net > 0 ? 'bg-warning-soft text-warning-text' : 'bg-good-soft text-good-text')}>
          {net > 0 ? '↑' : '↓'} {Math.abs(net)} net in 30 days
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <ResponsiveContainer width="100%" height={112}>
          <BarChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
            <defs>
              <linearGradient id="wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb36b" /><stop offset="100%" stopColor={c('var(--accent-strong)')} /></linearGradient>
            </defs>
            <XAxis dataKey="code" tickLine={false} axisLine={false} tick={{ fill: c('var(--muted)'), fontSize: 10 }} interval={0} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: c('var(--surface-2)'), radius: 6 }} />
            <Bar dataKey="pending" name="Active cases" fill="url(#wl)" radius={[6, 6, 6, 6]} maxBarSize={22} isAnimationActive={false} style={{ cursor: 'pointer' }}
              onClick={(d: unknown) => onPick(String((d as { payload: { code: string } }).payload.code))} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProfileCard({ data }: { data: DashboardData }) {
  const { user } = useAuth();
  const { meta, bureauName, regionName } = useLookups();
  const role = meta?.roles[user?.role ?? 'officer'] ?? '';
  const scope = user?.role === 'admin' ? 'All Bureaus/Cells' : user?.role === 'regional' ? regionName(user.region_code) : bureauName(user?.bureau_code);
  const actions = [
    { to: '/cases/new', icon: FilePlus2, label: 'Register' },
    { to: '/cases', icon: FolderKanban, label: 'Cases' },
    { to: '/overlaps', icon: GitMerge, label: 'Overlaps' },
    { to: '/reports', icon: BarChart3, label: 'Reports' },
  ];
  return (
    <section className="glass rounded-[28px] p-5">
      <div className="flex items-center justify-between">
        <Link to="/alerts" className="relative flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="Alerts"><Bell className="size-[18px]" /><span className="absolute right-2 top-2 size-2 rounded-full bg-accent" /></Link>
        <Link to="/reports" className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="Reports"><MoreVertical className="size-[18px]" /></Link>
      </div>
      <div className="-mt-3 flex flex-col items-center text-center">
        <span className="flex size-[72px] items-center justify-center rounded-full bg-gradient-to-br from-[#ffc58f] to-[#d4581a] text-2xl font-bold text-[#2a1203] ring-4 ring-[var(--border)]">{initials(user?.name)}</span>
        <span className="tile -mt-3 rounded-full px-3 py-0.5 text-[11px] font-semibold text-ink-2 backdrop-blur">{role.split(' / ')[0]}</span>
        <div className="mt-2 text-lg font-semibold">{user?.name}</div>
        <div className="text-xs text-ink-3">{scope}</div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="group flex flex-col items-center gap-1.5">
            <span className="tile flex size-12 items-center justify-center rounded-full text-ink transition group-hover:bg-accent group-hover:text-accent-ink"><a.icon className="size-5" /></span>
            <span className="text-[11px] text-ink-2">{a.label}</span>
          </Link>
        ))}
      </div>
      <OverlapCard data={data} />
    </section>
  );
}

/** The dashboard's "card": open overlaps on a marbled saffron surface with a dark side strip. */
function OverlapCard({ data }: { data: DashboardData }) {
  const o = data.overlaps;
  return (
    <Link to="/overlaps" aria-label="Open overlap coordination"
      className="relative mt-5 flex aspect-[1.62/1] overflow-hidden rounded-[22px] shadow-[0_26px_50px_-22px_rgba(226,98,26,0.85)] ring-1 ring-white/10 transition hover:-translate-y-0.5">
      <div className="marble relative flex min-w-0 flex-[1.9] flex-col justify-between p-4">
        <span className="relative z-[1] text-base font-extrabold italic tracking-tight drop-shadow">AICTE·ICMS</span>
        <div className="relative z-[1]">
          <div className="text-[11px] font-medium leading-snug text-white/90 drop-shadow">Potential Overlapping Cases<br />Coordination Required</div>
          <div className="mt-1 text-[40px] font-bold leading-none tracking-tight tnum drop-shadow">{o.open}</div>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between bg-[#120c09] p-3.5 text-white">
        <div className="flex items-center justify-between">
          <span className="flex h-7 w-9 items-center justify-center rounded-md bg-gradient-to-br from-[#f3d79a] to-[#b8862e] text-[#3a2508]"><GitMerge className="size-4" /></span>
          <span className="text-[10px] text-white/50">LIVE</span>
        </div>
        <div className="space-y-1.5 text-right">
          <div><div className="text-[10px] text-white/55">RB + PGRC</div><div className="text-sm font-semibold tnum">{o.rbPgrc}</div></div>
          <div><div className="text-[10px] text-white/55">Active cases</div><div className="text-sm font-semibold tnum">{o.cases}</div></div>
        </div>
      </div>
    </Link>
  );
}

function ActivityList({ data }: { data: DashboardData }) {
  const live = useLive();
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-lg font-semibold tracking-tight">Live activity</h2>
        <span className="flex items-center gap-1.5 text-xs text-ink-3"><span className={clsx('size-2 rounded-full', live.connected ? 'live-dot bg-good' : 'bg-muted')} />{live.connected ? 'Live' : 'Offline'}</span>
      </div>
      <div className="space-y-2.5">
        {data.recent.slice(0, 5).map((a) => {
          const b = a.to_bureau ?? a.bureau_code;
          const fresh = live.events.some((e) => e.case_id === a.case_id && Date.now() - new Date(e.at).getTime() < 15000);
          return (
            <Link key={a.id} to={`/cases/${a.case_id}`} className={clsx('glass block rounded-[22px] p-3.5 transition hover:-translate-y-0.5', fresh && 'flash')}>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: bureauColor(b) }}>{b}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{a.case_no.replace('AICTE/', '')}</div>
                  <div className="truncate text-xs text-ink-3">{a.institution_name ?? 'Unidentified institution'}</div>
                </div>
                <span className={clsx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
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
        <Link to="/cases" className="glass flex items-center justify-between rounded-[22px] px-4 py-3.5 text-sm font-semibold hover:text-accent-text">
          See all cases <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function OverlapWatch({ data }: { data: DashboardData }) {
  if (!data.overlaps.top.length) return null;
  return (
    <section className="glass rounded-[28px] p-5">
      <h2 className="text-lg font-semibold tracking-tight">Overlap watch</h2>
      <p className="mb-3 text-xs text-ink-3">Parallel action by multiple Bureaus/Cells</p>
      <ul className="space-y-2">
        {data.overlaps.top.map((o) => (
          <li key={o.institution_id}>
            <Link to={`/overlaps#inst-${o.institution_id}`} className="tile block rounded-2xl p-3 hover:bg-surface-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-snug">{o.institution?.name}</span>
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
