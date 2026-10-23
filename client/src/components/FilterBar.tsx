import { useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { useLookups, useAuth } from '../lib/context';
import { isoDaysAgo, isoToday } from '../lib/format';
import { Select, Input, Button } from './ui';

export const DATE_PRESETS = [
  { value: '', label: 'All time' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: 'fy', label: 'This financial year' },
  { value: 'custom', label: 'Custom range…' },
];

export function presetRange(p: string): { from?: string; to?: string } {
  if (!p || p === 'custom') return {};
  if (p === 'fy') {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return { from: `${y}-04-01`, to: isoToday() };
  }
  return { from: isoDaysAgo(Number(p)), to: isoToday() };
}

/** Bureau / region / date filters kept in the URL so views are shareable and survive reloads. */
export function useFilterParams(keys: string[] = ['bureau', 'region', 'from', 'to']) {
  const [sp, setSp] = useSearchParams();
  const values: Record<string, string> = {};
  for (const k of keys) values[k] = sp.get(k) ?? '';
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };
  return { values, set, sp };
}

export function ScopeFilters({ showDates = true }: { showDates?: boolean }) {
  const { meta } = useLookups();
  const { user } = useAuth();
  const { values, set, sp } = useFilterParams(['bureau', 'region', 'from', 'to', 'preset']);
  const preset = values.preset || (values.from ? 'custom' : '');
  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <Select aria-label="Bureau/Cell" className="w-48" value={values.bureau} onChange={(e) => set({ bureau: e.target.value })}>
        <option value="">All Bureaus/Cells</option>
        {meta?.bureaus.map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
      </Select>
      {user?.role !== 'regional' && (
        <Select aria-label="Region" className="w-44" value={values.region} onChange={(e) => set({ region: e.target.value })}>
          <option value="">All regions</option>
          {meta?.regions.map((r) => <option key={r.code} value={r.code}>{r.name} ({r.office})</option>)}
        </Select>
      )}
      {showDates && (
        <Select aria-label="Date of receipt" className="w-44" value={preset} onChange={(e) => { const p = e.target.value; set({ preset: p || undefined, ...(p === 'custom' ? {} : presetRange(p)), ...(p ? {} : { from: undefined, to: undefined }) }); }}>
          {DATE_PRESETS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </Select>
      )}
      {showDates && preset === 'custom' && (
        <>
          <Input type="date" aria-label="From" className="w-auto" value={values.from} onChange={(e) => set({ from: e.target.value, preset: 'custom' })} />
          <Input type="date" aria-label="To" className="w-auto" value={values.to} onChange={(e) => set({ to: e.target.value, preset: 'custom' })} />
        </>
      )}
      {[...sp.keys()].some((k) => ['bureau', 'region', 'from', 'to', 'preset'].includes(k)) && (
        <Button variant="ghost" size="sm" onClick={() => set({ bureau: undefined, region: undefined, from: undefined, to: undefined, preset: undefined })}><RotateCcw className="size-3.5" />Reset</Button>
      )}
    </div>
  );
}
