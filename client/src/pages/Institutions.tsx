import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, GitMerge, Search } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth, useLookups } from '../lib/context';
import { fmtDate, num } from '../lib/format';
import { BureauChip, Button, Card, Empty, Input, PageHeader, Select, Spinner } from '../components/ui';
import { useFilterParams } from '../components/FilterBar';

interface Row { id: number; aicte_id: string; name: string; city: string; state: string; region_code: string; type: string; ownership: string; approval_status: string; total: number; active: number; breached: number; active_bureaus: number; bureaus: string | null; last_received: string | null; risk: number; overlap: boolean }

export default function Institutions() {
  const { values, set } = useFilterParams(['q', 'region', 'type', 'overlap', 'sort', 'page']);
  const { meta, bureauName } = useLookups();
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState(values.q);
  useEffect(() => { const t = setTimeout(() => { if (q !== values.q) set({ q }); }, 300); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const page = Number(values.page) || 1;
  const { data, isLoading } = useQuery({ queryKey: ['institutions', values], queryFn: () => api<{ total: number; rows: Row[] }>(`/institutions${qs({ ...values, size: 30 })}`), placeholderData: keepPreviousData });
  const pages = data ? Math.max(1, Math.ceil(data.total / 30)) : 1;
  const maxRisk = Math.max(1, ...(data?.rows.map((r) => r.risk) ?? [1]));

  return (
    <div>
      <PageHeader title="Institutions" subtitle="Centralised institution profiles with consolidated complaint history. Ranked by a risk score combining volume, pendency, overdue and serious categories." />
      <Card className="mb-4" bodyClass="p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Name, former name, AICTE Permanent ID or city" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {user?.role !== 'regional' && (
            <Select className="w-auto" value={values.region} onChange={(e) => set({ region: e.target.value })} aria-label="Region">
              <option value="">All regions</option>
              {meta?.regions.map((r) => <option key={r.code} value={r.code}>{r.name} ({r.office})</option>)}
            </Select>
          )}
          <Select className="w-auto" value={values.type} onChange={(e) => set({ type: e.target.value })} aria-label="Type">
            <option value="">All types</option>
            {['Engineering', 'Management', 'Pharmacy', 'Polytechnic', 'Computer Applications', 'Architecture'].map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Select className="w-auto" value={values.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
            <option value="">Sort: risk score</option><option value="active">Sort: active cases</option><option value="breached">Sort: beyond timeline</option><option value="total">Sort: total complaints</option><option value="name">Sort: name</option>
          </Select>
          <label className="flex items-center gap-2 px-1 text-sm"><input type="checkbox" checked={values.overlap === '1'} onChange={(e) => set({ overlap: e.target.checked ? '1' : undefined })} />Overlapping only</label>
        </div>
      </Card>
      <Card bodyClass="p-0">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5 text-sm">
          <span className="text-ink-2"><b className="tnum text-ink">{num(data?.total)}</b> institutions</span>
          {pages > 1 && <div className="flex items-center gap-1"><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}><ChevronLeft className="size-4" /></Button><span className="tnum">Page {page} of {pages}</span><Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}><ChevronRight className="size-4" /></Button></div>}
        </div>
        {isLoading ? <Spinner /> : !data?.rows.length ? <Empty title="No institutions found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-hairline bg-surface-1 text-left text-xs text-ink-3">
                <tr><th className="px-4 py-2 font-medium">Institution</th><th className="px-3 py-2 font-medium">Region</th><th className="px-3 py-2 font-medium">Active with</th>
                  <th className="px-3 py-2 text-right font-medium">Complaints</th><th className="px-3 py-2 text-right font-medium">Active</th><th className="px-3 py-2 text-right font-medium">Beyond timeline</th><th className="px-3 py-2 font-medium">Last complaint</th><th className="px-4 py-2 font-medium">Risk</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-2" onClick={() => nav(`/institutions/${r.id}`)}>
                    <td className="px-4 py-2.5">
                      <Link to={`/institutions/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">{r.name}</Link>
                      <div className="text-xs text-ink-3">{r.aicte_id} · {r.city}, {r.state} · {r.type}</div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{r.region_code}</td>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap items-center gap-1">{r.bureaus?.split(',').map((b) => <BureauChip key={b} code={b} name={bureauName(b)} />)}{r.overlap && <span title="Overlap"><GitMerge className="size-4 text-critical-text" /></span>}</div></td>
                    <td className="px-3 py-2.5 text-right tnum">{r.total}</td>
                    <td className="px-3 py-2.5 text-right tnum">{r.active || 0}</td>
                    <td className={clsx('py-2.5 text-right tnum', r.breached ? 'font-medium text-critical-text' : 'text-ink-3')}>{r.breached || 0}</td>
                    <td className="px-3 py-2.5 text-ink-2">{fmtDate(r.last_received)}</td>
                    <td className="px-4 py-2.5"><span className="flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-[var(--s2)]" style={{ width: `${(r.risk / maxRisk) * 100}%` }} /></span><span className="text-xs tnum text-ink-3">{Math.round(r.risk)}</span></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
