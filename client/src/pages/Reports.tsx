import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { api, download, qs } from '../lib/api';
import { fmtDateTime, monthLabel, num, pct } from '../lib/format';
import { AGE_COLORS } from '../lib/colors';
import type { Report } from '../lib/types';
import { BarsChart, type SeriesDef } from '../components/charts';
import { Button, Card, ErrorBox, PageHeader, Select, Spinner, Tabs } from '../components/ui';
import { ScopeFilters, useFilterParams } from '../components/FilterBar';

const TYPES = [
  { value: 'bureau', label: 'Bureau/Cell-wise' },
  { value: 'region', label: 'Region-wise' },
  { value: 'status', label: 'Status-wise' },
  { value: 'category', label: 'Category-wise' },
  { value: 'institution', label: 'Institution-wise' },
  { value: 'ageing', label: 'Pending ageing' },
  { value: 'disposal', label: 'Disposal rate' },
  { value: 'overlaps', label: 'Overlaps / duplicates' },
  { value: 'performance', label: 'Monthly / quarterly' },
  { value: 'officer', label: 'Officer workload' },
] as const;

// One fixed slot per measure (validated categorical order), so a measure keeps its color across reports.
const SERIES: Record<string, SeriesDef> = {
  received: { key: 'received', name: 'Received', color: 'var(--s1)' },
  disposed: { key: 'disposed', name: 'Disposed', color: 'var(--s2)' },
  pending: { key: 'pending', name: 'Pending', color: 'var(--s3)' },
  beyond_sla: { key: 'beyond_sla', name: 'Beyond timeline', color: 'var(--s4)' },
  closing: { key: 'closing', name: 'Closing pendency', color: 'var(--s5)' },
  cases: { key: 'cases', name: 'Cases', color: 'var(--s1)' },
  disposal_rate: { key: 'disposal_rate', name: 'Disposal rate %', color: 'var(--s1)' },
  sla_compliance: { key: 'sla_compliance', name: 'Within timeline %', color: 'var(--s2)' },
};

export default function Reports() {
  const [sp, setSp] = useSearchParams();
  const type = sp.get('type') || 'bureau';
  const period = sp.get('period') || 'monthly';
  const { values } = useFilterParams();
  const params = { ...values, period: type === 'performance' ? period : undefined };
  const { data, isLoading, error } = useQuery({ queryKey: ['report', type, params], queryFn: () => api<Report>(`/reports/${type}${qs(params)}`) });

  const setType = (t: string) => { const n = new URLSearchParams(sp); n.set('type', t); setSp(n, { replace: true }); };
  const chart = data?.chart;
  let chartSeries: SeriesDef[] = [];
  if (chart) {
    chartSeries = chart.ordinal
      ? chart.series.map((k, i) => ({ key: k, name: chart.labels?.[k] ?? k, color: AGE_COLORS[i] }))
      : chart.series.map((k) => SERIES[k] ?? { key: k, name: k, color: 'var(--s1)' });
  }
  const chartRows = data?.rows.map((r) => ({ ...r, code: r.code ?? r.name })) ?? [];

  return (
    <div>
      <PageHeader title="Reports & analytics" subtitle="Generate Bureau/Cell-, region-, institution- and status-wise reports. Filters apply to date of receipt. Export to CSV (opens in Excel) or print to PDF."
        actions={<>
          <Button onClick={() => window.print()}><Printer className="size-4" />Print / PDF</Button>
          <Button variant="primary" onClick={() => download(`/reports/${type}${qs({ ...params, format: 'csv' })}`, `${type}.csv`)}><Download className="size-4" />Export CSV</Button>
        </>} />
      <Tabs value={type} onChange={setType} tabs={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ScopeFilters />
        {type === 'performance' && (
          <Select className="w-auto" value={period} onChange={(e) => { const n = new URLSearchParams(sp); n.set('period', e.target.value); setSp(n, { replace: true }); }} aria-label="Period">
            <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
          </Select>
        )}
      </div>
      <ErrorBox error={error} />
      {isLoading || !data ? <Spinner /> : (
        <div className="space-y-4">
          <div className="hidden print:block"><h2 className="text-lg font-semibold">AICTE — {data.title}</h2><p className="text-xs">Generated {fmtDateTime(data.generated_at)}</p></div>
          {data.summary && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Object.entries(data.summary).map(([k, v]) => (
                <div key={k} className="glass rounded-[22px] p-4"><div className="text-xs capitalize text-ink-2">{k.replace(/([A-Z])/g, ' $1')}</div><div className="mt-1 text-2xl font-semibold tnum">{num(v)}</div></div>
              ))}
            </div>
          )}
          {chart && chartRows.length > 0 && (
            <Card title={data.title} subtitle={`Generated ${fmtDateTime(data.generated_at)}`}>
              <BarsChart data={chartRows} x={chart.x === 'code' ? 'code' : chart.x} series={chartSeries} stacked={chart.stacked} height={300}
                valueSuffix={chart.percent ? '%' : undefined} yMax={chart.percent ? 100 : undefined}
                xFormatter={chart.x === 'period' && period === 'monthly' ? monthLabel : undefined}
                line={chart.line ? SERIES[chart.line] : undefined} />
            </Card>
          )}
          <Card title={chart ? 'Data' : data.title} subtitle={!chart ? `Generated ${fmtDateTime(data.generated_at)} · ${data.rows.length} rows` : `${data.rows.length} rows`} bodyClass="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-hairline bg-surface-1">
                  <tr>{data.columns.map((c) => <th key={c.key} className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-ink-3 ${c.type ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
                </thead>
                <tbody className="tnum">
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-b border-hairline last:border-0 hover:bg-surface-2">
                      {data.columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.type ? 'text-right' : ''}`}>{cell(r, c.key, c.type, c.link)}</td>)}
                    </tr>
                  ))}
                </tbody>
                {data.totals && (
                  <tfoot className="border-t-2 border-line bg-surface-1 font-semibold tnum">
                    <tr>{data.columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.type ? 'text-right' : ''}`}>{cell(data.totals!, c.key, c.type)}</td>)}</tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function cell(r: Record<string, unknown>, key: string, type?: string, link?: string) {
  const v = r[key];
  if (v === null || v === undefined || v === '') return <span className="text-muted">—</span>;
  if (type === 'pct') return pct(Number(v));
  if (type === 'num') return typeof v === 'number' ? (Number.isInteger(v) ? num(v) : v.toFixed(1)) : String(v);
  if (link === 'institution' && r.institution_id) return <Link className="text-accent-text hover:underline" to={`/institutions/${r.institution_id}`}>{String(v)}</Link>;
  if (link === 'institution' && r.id) return <Link className="text-accent-text hover:underline" to={`/institutions/${r.id}`}>{String(v)}</Link>;
  return String(v);
}
