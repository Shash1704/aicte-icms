import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, GitMerge, Mail, MapPin, Phone, User } from 'lucide-react';
import { api } from '../lib/api';
import { useLookups } from '../lib/context';
import { fmtDate, fmtDateTime, relTime } from '../lib/format';
import { bureauColor, BUREAU_ORDER } from '../lib/colors';
import type { CaseRow, Institution, OverlapGroup } from '../lib/types';
import { BarsChart } from '../components/charts';
import { BureauChip, Card, ErrorBox, KeyVal, PageHeader, SeverityBadge, SlaBadge, Spinner, StatusBadge } from '../components/ui';

interface InstDetail extends Omit<Institution, 'aliases'> {
  aliases: string[]; cases: CaseRow[]; byBureau: Array<{ bureau: string; total: number; active: number; breached: number }>;
  byCategory: Record<string, number>; overlap: OverlapGroup | null; region: { name: string; office: string };
  recentActions: Array<{ at: string; action_type: string; bureau_code: string; to_bureau: string | null; remarks: string | null; case_no: string; case_id: number; actor_name: string | null }>;
}

export default function InstitutionDetail() {
  const { id } = useParams();
  const { data: d, isLoading, error } = useQuery({ queryKey: ['institution', id], queryFn: () => api<InstDetail>(`/institutions/${id}`) });
  const { bureauName, categoryName, actionLabel } = useLookups();
  if (isLoading) return <Spinner />;
  if (error || !d) return <ErrorBox error={error} />;
  const active = d.cases.filter((c) => c.status !== 'Disposed');
  const cats = Object.entries(d.byCategory).sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, name: categoryName(code), n }));

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Institutions', to: '/institutions' }, { label: d.aicte_id }]} title={d.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">AICTE Permanent ID <b className="text-ink">{d.aicte_id}</b> · {d.type} · {d.ownership} · <span className={clsx('rounded px-1.5 py-0.5 text-xs', d.approval_status === 'Approved' ? 'bg-good-soft text-good-text' : 'bg-warning-soft text-warning-text')}>{d.approval_status}</span></span>}
        actions={<Link to={`/cases?institution_id=${d.id}`} className="text-sm font-medium text-accent-text hover:underline">Open in case register</Link>} />

      {d.overlap && (
        <div className="mb-4 flex flex-col gap-2 rounded-[10px] border border-critical/35 bg-critical-soft p-5 backdrop-blur-xl sm:flex-row sm:items-center">
          <GitMerge className="size-6 shrink-0 text-critical-text" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-critical-text">Potential Overlapping Cases – Coordination Required</span><SeverityBadge severity={d.overlap.severity} /><span className="rounded-full bg-surface px-2 py-0.5 text-xs">{d.overlap.status}{d.overlap.lead_bureau ? ` · lead ${d.overlap.lead_bureau}` : ''}</span></div>
            <div className="text-sm text-ink-2">{d.overlap.reasons[0]}</div>
          </div>
          <Link to={`/overlaps#inst-${d.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-critical-text hover:underline">Coordinate <ArrowRight className="size-4" /></Link>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Total complaints', d.cases.length],
          ['Active', active.length],
          ['Beyond timeline', active.filter((c) => c.sla === 'breached').length],
          ['Bureaus/Cells involved (active)', new Set(active.map((c) => c.bureau_code)).size],
        ].map(([l, v]) => (
          <div key={l as string} className="glass rounded-[10px] p-4"><div className="text-xs text-ink-2">{l}</div><div className="mt-1 text-2xl font-semibold tnum">{v}</div></div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card title="Cross-Bureau/Cell timeline" subtitle="Each bar is a complaint, from receipt to disposal (or today). Overlapping bars in different lanes = parallel handling.">
            <Swimlanes cases={d.cases} />
          </Card>
          <Card title={`All complaints (${d.cases.length})`} bodyClass="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-hairline bg-surface-1 text-left text-xs text-ink-3"><tr>
                  <th className="px-4 py-2 font-medium">Case ID</th><th className="py-2 font-medium">Received</th><th className="py-2 font-medium">Subject</th><th className="py-2 font-medium">With</th><th className="py-2 font-medium">Status</th><th className="py-2 font-medium">Officer</th><th className="px-4 py-2 font-medium">Timeline</th>
                </tr></thead>
                <tbody>
                  {d.cases.map((c) => (
                    <tr key={c.id} className="border-b border-hairline last:border-0 hover:bg-surface-2">
                      <td className="whitespace-nowrap px-4 py-2"><Link className="font-medium text-accent-text hover:underline" to={`/cases/${c.id}`}>{c.case_no}</Link></td>
                      <td className="whitespace-nowrap py-2 text-ink-2">{fmtDate(c.received_on)}</td>
                      <td className="max-w-72 py-2"><div className="truncate">{c.subject}</div><div className="text-xs text-ink-3">{categoryName(c.category)}</div></td>
                      <td className="py-2"><BureauChip code={c.bureau_code} /></td>
                      <td className="py-2"><StatusBadge status={c.status} /></td>
                      <td className="whitespace-nowrap py-2 text-ink-2">{c.officer_name ?? '—'}</td>
                      <td className="px-4 py-2"><SlaBadge state={c.sla} daysLeft={c.days_left} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Institution profile">
            <dl className="space-y-3">
              <KeyVal label="Address"><span className="flex gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" />{d.address}, {d.city}, {d.district !== d.city ? `${d.district}, ` : ''}{d.state} – {d.pincode}</span></KeyVal>
              <KeyVal label="AICTE region">{d.region?.name} (Regional Office, {d.region?.office})</KeyVal>
              <div className="grid grid-cols-2 gap-3"><KeyVal label="Established">{d.established}</KeyVal><KeyVal label="Approved intake">{d.approved_intake}</KeyVal></div>
              <KeyVal label="Head of institution"><span className="flex items-center gap-1.5"><User className="size-4 text-ink-3" />{d.head_name}</span></KeyVal>
              <KeyVal label="Contact"><span className="flex items-center gap-1.5"><Mail className="size-4 text-ink-3" />{d.email}</span><span className="mt-1 flex items-center gap-1.5"><Phone className="size-4 text-ink-3" />{d.phone}</span></KeyVal>
              {!!d.aliases.length && <KeyVal label="Former / alternate names">{d.aliases.join('; ')}</KeyVal>}
            </dl>
          </Card>
          <Card title="Bureau/Cell involvement">
            <ul className="space-y-2">
              {d.byBureau.sort((a, b) => b.active - a.active || b.total - a.total).map((b) => (
                <li key={b.bureau} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: bureauColor(b.bureau) }} />
                  <span className="flex-1">{bureauName(b.bureau)}</span>
                  <span className="tnum text-ink-2">{b.active} active</span>
                  <span className="w-16 text-right tnum text-ink-3">{b.total} total</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Complaint categories">
            <BarsChart horizontal height={Math.max(120, cats.length * 30)} data={cats} x="name" series={[{ key: 'n', name: 'Complaints', color: 'var(--s1)' }]} xFormatter={(v) => (v.length > 14 ? v.slice(0, 13) + '…' : v)} />
          </Card>
          <Card title="Recent actions across Bureaus/Cells" bodyClass="p-0">
            <ul className="max-h-96 divide-y divide-hairline overflow-y-auto">
              {d.recentActions.slice(0, 25).map((a, i) => (
                <li key={i} className="px-4 py-2 text-sm">
                  <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: bureauColor(a.to_bureau ?? a.bureau_code) }} /><Link to={`/cases/${a.case_id}`} className="font-medium hover:underline">{a.case_no}</Link><span className="ml-auto text-xs text-ink-3" title={fmtDateTime(a.at)}>{relTime(a.at)}</span></div>
                  <div className="text-ink-2">{actionLabel(a.action_type)}{a.to_bureau ? ` → ${a.to_bureau}` : ''}</div>
                  <div className="text-xs text-ink-3">{a.actor_name}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Swimlanes({ cases }: { cases: CaseRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  const [hover, setHover] = useState<{ c: CaseRow; x: number; y: number } | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const today = Date.now();
  const lanes = useMemo(() => BUREAU_ORDER.filter((b) => cases.some((c) => c.bureau_code === b || c.origin_bureau === b)), [cases]);
  if (!cases.length) return <p className="text-sm text-ink-3">No complaints.</p>;
  const start = Math.min(...cases.map((c) => new Date(c.received_on).getTime()), today - 180 * 86400000);
  const left = 52, right = 8, laneH = 34;
  const x = (t: number) => left + ((t - start) / (today - start)) * (w - left - right);
  // pack bars into sub-rows per lane to avoid overlaps within the same bureau
  const rows: Array<{ c: CaseRow; lane: number; sub: number; x1: number; x2: number }> = [];
  const laneSubs: number[] = [];
  lanes.forEach((b, li) => {
    const ends: number[] = [];
    cases.filter((c) => c.bureau_code === b).sort((a, z) => a.received_on.localeCompare(z.received_on)).forEach((c) => {
      const x1 = x(new Date(c.received_on).getTime());
      const x2 = Math.max(x1 + 4, x(c.disposed_on ? new Date(c.disposed_on).getTime() : today));
      let sub = ends.findIndex((e) => e + 3 < x1);
      if (sub === -1) { sub = ends.length; ends.push(x2); } else ends[sub] = x2;
      rows.push({ c, lane: li, sub, x1, x2 });
    });
    laneSubs[li] = Math.max(1, ends.length);
  });
  const subH = 9;
  const laneTop = (li: number) => laneSubs.slice(0, li).reduce((s, n) => s + Math.max(laneH, n * (subH + 3) + 12), 0);
  const height = laneTop(lanes.length) + 22;
  const ticks: number[] = [];
  const d0 = new Date(start); d0.setDate(1); d0.setMonth(d0.getMonth() + 1);
  for (let t = d0.getTime(); t < today; ) { ticks.push(t); const d = new Date(t); d.setMonth(d.getMonth() + (today - start > 400 * 86400000 ? 3 : 2)); t = d.getTime(); }

  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} role="img" aria-label="Timeline of complaints by Bureau/Cell">
        {lanes.map((b, li) => {
          const top = laneTop(li);
          const h = Math.max(laneH, laneSubs[li] * (subH + 3) + 12);
          return (
            <g key={b}>
              {li > 0 && <line x1={0} x2={w} y1={top} y2={top} stroke="var(--hairline)" />}
              <text x={0} y={top + h / 2 + 4} fontSize={11} fill="var(--ink-2)" fontWeight={600}>{b}</text>
            </g>
          );
        })}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={height - 18} stroke="var(--hairline)" />
            <text x={x(t)} y={height - 4} fontSize={10} fill="var(--muted)" textAnchor="middle">{new Date(t).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</text>
          </g>
        ))}
        <line x1={x(today)} x2={x(today)} y1={0} y2={height - 18} stroke="var(--critical)" strokeWidth={1} />
        {rows.map(({ c, lane, sub, x1, x2 }) => {
          const y = laneTop(lane) + 6 + sub * (subH + 3);
          const activeCase = c.status !== 'Disposed';
          return (
            <rect key={c.id} x={x1} y={y} width={x2 - x1} height={subH} rx={3}
              fill={bureauColor(c.bureau_code)} fillOpacity={activeCase ? 1 : 0.35}
              stroke={c.sla === 'breached' ? 'var(--critical)' : 'var(--panel-solid)'} strokeWidth={c.sla === 'breached' ? 1.5 : 1}
              className="cursor-pointer" onClick={() => nav(`/cases/${c.id}`)}
              onMouseEnter={() => setHover({ c, x: x1, y })} onMouseLeave={() => setHover(null)} />
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 w-64 tile rounded-lg bg-surface px-3 py-2 text-xs shadow-lg" style={{ left: Math.min(hover.x, w - 260), top: hover.y + 14 }}>
          <div className="font-semibold">{hover.c.case_no}</div>
          <div className="text-ink-2">{hover.c.subject}</div>
          <div className="mt-1 text-ink-3">{fmtDate(hover.c.received_on)} → {hover.c.disposed_on ? fmtDate(hover.c.disposed_on) : 'active'} · {hover.c.status}</div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[var(--s1)]" />Active</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[var(--s1)] opacity-35" />Disposed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm border-[1.5px] border-critical" />Beyond timeline</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-critical" />Today</span>
      </div>
    </div>
  );
}
