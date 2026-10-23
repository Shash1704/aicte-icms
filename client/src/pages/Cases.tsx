import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FilePlus2, GitMerge, HelpCircle, Printer, Search, SlidersHorizontal, X } from 'lucide-react';
import { api, download, qs } from '../lib/api';
import { useAuth, useLookups } from '../lib/context';
import { fmtDate, num, relTime } from '../lib/format';
import type { CaseRow } from '../lib/types';
import { BureauChip, Button, Card, Empty, ErrorBox, Input, PageHeader, PriorityBadge, Select, SlaBadge, Spinner, StatusBadge } from '../components/ui';
import { DATE_PRESETS, presetRange, useFilterParams } from '../components/FilterBar';

const KEYS = ['q', 'institution', 'aicte_id', 'case_no', 'bureau', 'region', 'category', 'status', 'priority', 'sla', 'from', 'to', 'preset', 'overlap', 'officer', 'unresolved', 'active', 'institution_id', 'source', 'sort', 'dir', 'page'];

export default function Cases() {
  const { values, set } = useFilterParams(KEYS);
  const { meta, categoryName } = useLookups();
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState(values.q);
  const [showMore, setShowMore] = useState(() => !!(values.institution || values.aicte_id || values.case_no || values.priority || values.source));
  useEffect(() => setQ(values.q), [values.q]);
  useEffect(() => { const t = setTimeout(() => { if (q !== values.q) set({ q }); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const { preset: _p, ...apiParams } = values;
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['cases', apiParams],
    queryFn: () => api<{ total: number; page: number; size: number; rows: CaseRow[] }>(`/cases${qs({ ...apiParams, size: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const page = Number(values.page) || 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const activeFilters = KEYS.filter((k) => !['sort', 'dir', 'page', 'preset'].includes(k) && values[k]);

  const sortBy = (key: string) => set({ sort: key, dir: values.sort === key && values.dir !== 'asc' ? 'asc' : 'desc', page: undefined });

  const preset = values.preset || (values.from || values.to ? 'custom' : '');
  const sortProps = { current: values.sort || 'received_on', dir: values.dir, onSort: sortBy };
  return (
    <div>
      <PageHeader title="Complaint / Case register" subtitle="All institution-related complaints across Bureaus/Cells — search, filter and track"
        actions={<>
          <Button onClick={() => window.print()}><Printer className="size-4" />Print</Button>
          <Button onClick={() => download(`/cases${qs({ ...apiParams, format: 'csv' })}`, 'cases.csv')}><Download className="size-4" />Export CSV</Button>
          <Link to="/cases/new"><Button variant="primary"><FilePlus2 className="size-4" />Register</Button></Link>
        </>} />

      <Card className="no-print mb-4" bodyClass="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Institution name, AICTE ID, Case ID, subject, complainant, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-full sm:w-48" aria-label="Bureau/Cell" value={values.bureau} onChange={(e) => set({ bureau: e.target.value })}>
            <option value="">All Bureaus/Cells</option>
            {meta?.bureaus.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
          </Select>
          <Select className="w-full sm:w-48" aria-label="Status" value={values.status} onChange={(e) => set({ status: e.target.value, active: undefined })}>
            <option value="">Any status</option>
            {meta?.statuses.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select className="w-full sm:w-48" aria-label="Timeline" value={values.sla} onChange={(e) => set({ sla: e.target.value })}>
            <option value="">Any timeline</option>
            <option value="breached">Beyond timeline</option>
            <option value="approaching">Due within 7 days</option>
            <option value="on-track">On track</option>
          </Select>
          <Button variant="ghost" onClick={() => setShowMore((s) => !s)}><SlidersHorizontal className="size-4" />{showMore ? 'Fewer' : 'More'} filters</Button>
        </div>
        {showMore && (
          <div className="mt-3 grid gap-2 border-t border-hairline pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Institution name" value={values.institution} onChange={(e) => set({ institution: e.target.value })} />
            <Input placeholder="AICTE Permanent ID" value={values.aicte_id} onChange={(e) => set({ aicte_id: e.target.value })} />
            <Input placeholder="Complaint / Case ID" value={values.case_no} onChange={(e) => set({ case_no: e.target.value })} />
            {user?.role !== 'regional' ? (
              <Select aria-label="Region" value={values.region} onChange={(e) => set({ region: e.target.value })}>
                <option value="">All regions</option>
                {meta?.regions.map((r) => <option key={r.code} value={r.code}>{r.name} ({r.office})</option>)}
              </Select>
            ) : <div />}
            <Select aria-label="Category" value={values.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">All categories</option>
              {meta?.categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
            <Select aria-label="Priority" value={values.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">Any priority</option>
              {meta?.priorities.map((p) => <option key={p}>{p}</option>)}
            </Select>
            <Select aria-label="Date of receipt" value={preset} onChange={(e) => { const p = e.target.value; set({ preset: p || undefined, ...(p === 'custom' ? {} : presetRange(p)), ...(p ? {} : { from: undefined, to: undefined }) }); }}>
              {DATE_PRESETS.map((d) => <option key={d.value} value={d.value}>Received: {d.label}</option>)}
            </Select>
            <div className="flex gap-2">
              <Input type="date" aria-label="Received from" value={values.from} onChange={(e) => set({ from: e.target.value, preset: 'custom' })} />
              <Input type="date" aria-label="Received to" value={values.to} onChange={(e) => set({ to: e.target.value, preset: 'custom' })} />
            </div>
            <Select aria-label="Source" value={values.source} onChange={(e) => set({ source: e.target.value })}>
              <option value="">Any source</option>
              {meta?.sources.map((s) => <option key={s}>{s}</option>)}
            </Select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.overlap === '1'} onChange={(e) => set({ overlap: e.target.checked ? '1' : undefined })} />Only overlapping institutions</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.officer === 'me'} onChange={(e) => set({ officer: e.target.checked ? 'me' : undefined })} />Assigned to me</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.unresolved === '1'} onChange={(e) => set({ unresolved: e.target.checked ? '1' : undefined })} />Institution not yet identified</label>
          </div>
        )}
        {!!activeFilters.length && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {activeFilters.map((k) => (
              <button key={k} onClick={() => set({ [k]: undefined, ...(k === 'from' || k === 'to' ? { preset: undefined } : {}) })} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-text hover:brightness-95">
                {labelFor(k, values[k], categoryName)}<X className="size-3" />
              </button>
            ))}
            <button className="text-xs text-ink-3 hover:underline" onClick={() => set(Object.fromEntries(KEYS.map((k) => [k, undefined])))}>Clear all</button>
          </div>
        )}
      </Card>

      <ErrorBox error={error} />
      <Card bodyClass="p-0">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5 text-sm">
          <span className="text-ink-2">{data ? <><b className="tnum text-ink">{num(data.total)}</b> case{data.total === 1 ? '' : 's'}</> : '—'}{isFetching && <span className="ml-2 text-xs text-ink-3">updating…</span>}</span>
          <Pager page={page} pages={pages} onPage={(p) => set({ page: String(p) })} />
        </div>
        {isLoading ? <Spinner /> : !data?.rows.length ? <Empty title="No cases match these filters" body="Try removing a filter or widening the date range." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-hairline bg-surface-1">
                <tr>
                  <Th k="received_on" {...sortProps}>Case ID · received</Th><Th k="institution" {...sortProps}>Institution</Th><Th>Complaint</Th>
                  <Th k="bureau" {...sortProps}>With · officer</Th><Th k="status" {...sortProps}>Status · priority</Th><Th k="last_action_on" {...sortProps}>Last action · next action</Th><Th k="days_left" {...sortProps}>Timeline</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer border-b border-hairline align-top last:border-0 hover:bg-surface-2" onClick={() => nav(`/cases/${c.id}`)}>
                    <td className="whitespace-nowrap px-2.5 py-2.5">
                      <Link to={`/cases/${c.id}`} className="font-medium text-accent-text hover:underline" onClick={(e) => e.stopPropagation()}>{c.case_no}</Link>
                      <div className="text-xs tnum text-ink-3">{fmtDate(c.received_on)}</div>{c.origin_bureau !== c.bureau_code && <div className="text-[11px] text-ink-3">from {c.origin_bureau}</div>}
                    </td>
                    <td className="max-w-44 px-2.5 py-2.5">
                      {c.institution_id ? (
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0"><div className="truncate font-medium" title={c.institution_name ?? ''}>{c.institution_name}</div><div className="truncate text-xs text-ink-3">{c.aicte_id} · {c.city}</div></div>
                          {c.overlap && <span title="Potential overlap: other Bureaus/Cells have active cases on this institution"><GitMerge className="mt-0.5 size-4 shrink-0 text-critical-text" /></span>}
                        </div>
                      ) : (
                        <div className="flex items-start gap-1.5 text-warning-text"><HelpCircle className="mt-0.5 size-4 shrink-0" /><div className="min-w-0"><div className="truncate">“{c.institution_name_raw}”</div><div className="text-xs">needs identification</div></div></div>
                      )}
                    </td>
                    <td className="max-w-40 px-2.5 py-2.5"><div className="truncate text-ink-2" title={c.subject}>{c.subject}</div><div className="truncate text-xs text-ink-3">{categoryName(c.category)}</div></td>
                    <td className="px-2.5 py-2.5"><BureauChip code={c.bureau_code} /><div className="mt-0.5 max-w-32 truncate text-xs text-ink-3">{c.officer_name ?? 'Unassigned'}</div></td>
                    <td className="px-2.5 py-2.5"><StatusBadge status={c.status} />{(c.priority === 'High' || c.priority === 'Critical') && <div className="mt-1"><PriorityBadge priority={c.priority} /></div>}</td>
                    <td className="max-w-44 px-2.5 py-2.5">
                      <div className="truncate text-ink-2" title={c.last_action ?? ''}>{c.last_action} <span className="text-xs text-ink-3">· {relTime(c.last_action_on)}</span></div>
                      <div className="truncate text-xs text-ink-3" title={c.next_action ?? ''}>{c.next_action ? <>Next: {c.next_action}{c.next_action_due && ` by ${fmtDate(c.next_action_due)}`}</> : '—'}</div>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5"><SlaBadge state={c.sla} daysLeft={c.days_left} /><div className="mt-0.5 text-[11px] text-ink-3">due {fmtDate(c.expected_disposal)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.size && <div className="flex justify-end border-t border-hairline px-4 py-2.5"><Pager page={page} pages={pages} onPage={(p) => set({ page: String(p) })} /></div>}
      </Card>
    </div>
  );
}

function Th({ k, children, className, current, dir, onSort }: { k?: string; children: React.ReactNode; className?: string; current?: string; dir?: string; onSort?: (k: string) => void }) {
  return (
    <th className={clsx('whitespace-nowrap px-2.5 py-2 text-left text-xs font-medium text-ink-3', className)}>
      {k && onSort ? (
        <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort(k)}>
          {children}{current === k && (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
      ) : children}
    </th>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="no-print flex items-center gap-1 text-sm">
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
      <span className="tnum text-ink-2">Page {page} of {pages}</span>
      <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
    </div>
  );
}

function labelFor(k: string, v: string, categoryName: (c: string) => string) {
  const map: Record<string, string> = {
    q: `“${v}”`, institution: `Institution: ${v}`, aicte_id: `AICTE ID: ${v}`, case_no: `Case: ${v}`, bureau: `Bureau/Cell: ${v}`, region: `Region: ${v}`,
    category: categoryName(v), status: v, priority: `Priority: ${v}`, sla: { breached: 'Beyond timeline', approaching: 'Due in 7 days', 'on-track': 'On track' }[v] ?? v,
    from: `From ${fmtDate(v)}`, to: `To ${fmtDate(v)}`, overlap: 'Overlapping institutions', officer: 'Assigned to me', unresolved: 'Institution not identified',
    active: 'Active (not disposed)', institution_id: `Institution #${v}`, source: v,
  };
  return map[k] ?? `${k}: ${v}`;
}
