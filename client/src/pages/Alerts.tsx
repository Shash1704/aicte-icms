import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowRightLeft, BellRing, CheckCheck, Clock, GitMerge, HelpCircle, Link2, AlertOctagon } from 'lucide-react';
import { api, qs } from '../lib/api';
import { fmtDateTime, relTime } from '../lib/format';
import type { Alert } from '../lib/types';
import { Button, Card, Empty, PageHeader, Select, SeverityBadge, Spinner } from '../components/ui';
import { useFilterParams } from '../components/FilterBar';

export const ALERT_TYPES: Record<string, { label: string; icon: React.ReactNode }> = {
  OVERLAP: { label: 'Overlapping cases', icon: <GitMerge className="size-4" /> },
  DUPLICATE: { label: 'Possible duplicate', icon: <Link2 className="size-4" /> },
  SLA_BREACH: { label: 'Timeline crossed', icon: <AlertTriangle className="size-4" /> },
  SLA_APPROACHING: { label: 'Timeline approaching', icon: <Clock className="size-4" /> },
  PENDING_REMINDER: { label: 'Pending reminder', icon: <BellRing className="size-4" /> },
  ESCALATION: { label: 'Escalation', icon: <AlertOctagon className="size-4" /> },
  TRANSFER_IN: { label: 'Transferred in', icon: <ArrowRightLeft className="size-4" /> },
  UNRESOLVED_INSTITUTION: { label: 'Institution to identify', icon: <HelpCircle className="size-4" /> },
};

export default function Alerts() {
  const { values, set } = useFilterParams(['type', 'severity', 'state', 'unread']);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['alerts', values], queryFn: () => api<{ rows: Alert[]; counts: Array<{ type: string; severity: string; n: number; unread: number }> }>(`/alerts${qs({ ...values, limit: 300 })}`) });
  const read = useMutation({ mutationFn: (id: number) => api(`/alerts/${id}/read`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }).then(() => qc.invalidateQueries({ queryKey: ['alerts-summary'] })) });
  const readAll = useMutation({ mutationFn: () => api('/alerts/read-all', { method: 'POST' }), onSuccess: () => qc.invalidateQueries() });
  const byType: Record<string, { n: number; unread: number }> = {};
  for (const c of data?.counts ?? []) { byType[c.type] ??= { n: 0, unread: 0 }; byType[c.type].n += c.n; byType[c.type].unread += c.unread; }

  return (
    <div>
      <PageHeader title="Alerts & notifications" subtitle="Overlap and duplicate alerts, pending reminders, escalations and timeline (SLA) alerts for your Bureau/Cell. Alerts resolve automatically when the underlying condition clears."
        actions={<Button onClick={() => readAll.mutate()} loading={readAll.isPending}><CheckCheck className="size-4" />Mark all read</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {Object.entries(ALERT_TYPES).map(([k, t]) => (
          <button key={k} onClick={() => set({ type: values.type === k ? undefined : k })}
            className={clsx('glass rounded-[22px] p-4 text-left transition hover:-translate-y-0.5', values.type === k ? 'border-accent ring-1 ring-accent' : 'border-line')}>
            <div className="flex items-center gap-1.5 text-xs text-ink-2">{t.icon}{t.label}</div>
            <div className="mt-1 text-xl font-semibold tnum">{byType[k]?.n ?? 0}</div>
            <div className="text-[11px] text-ink-3">{byType[k]?.unread ?? 0} unread</div>
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select className="w-auto" value={values.severity} onChange={(e) => set({ severity: e.target.value })} aria-label="Severity">
          <option value="">Any severity</option><option value="critical">Critical</option><option value="serious">Serious</option><option value="warning">Warning</option><option value="info">Info</option>
        </Select>
        <Select className="w-auto" value={values.state} onChange={(e) => set({ state: e.target.value })} aria-label="State">
          <option value="">Active</option><option value="resolved">Resolved</option><option value="all">All</option>
        </Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.unread === '1'} onChange={(e) => set({ unread: e.target.checked ? '1' : undefined })} />Unread only</label>
      </div>
      <Card bodyClass="p-0">
        {isLoading ? <Spinner /> : !data?.rows.length ? <Empty title="No alerts" /> : (
          <ul className="divide-y divide-hairline">
            {data.rows.map((a) => (
              <li key={a.id} className={clsx('flex gap-3 px-4 py-3', !a.read && 'bg-accent-soft/30')}>
                <span className={clsx('mt-0.5', a.severity === 'critical' ? 'text-critical-text' : a.severity === 'serious' ? 'text-serious-text' : a.severity === 'warning' ? 'text-warning-text' : 'text-info-text')}>{ALERT_TYPES[a.type]?.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx('text-sm', !a.read && 'font-semibold')}>{a.title}</span>
                    <SeverityBadge severity={a.severity} />
                    {a.resolved_at && <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs text-good-text">resolved</span>}
                  </div>
                  {a.message && <p className="mt-0.5 text-sm text-ink-2">{a.message}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                    <span title={fmtDateTime(a.created_at)}>{relTime(a.created_at)}</span>
                    <span>{ALERT_TYPES[a.type]?.label}</span>
                    {a.bureau_code && <span>For: {a.bureau_code.split(',').filter(Boolean).join(', ')}</span>}
                    {a.case_id && <Link className="text-accent-text hover:underline" to={`/cases/${a.case_id}`} onClick={() => !a.read && read.mutate(a.id)}>Open case {a.case_no}</Link>}
                    {a.type === 'OVERLAP' && a.institution_id && <Link className="text-accent-text hover:underline" to={`/overlaps#inst-${a.institution_id}`} onClick={() => !a.read && read.mutate(a.id)}>Coordinate</Link>}
                    {!a.read && <button className="text-ink-2 hover:underline" onClick={() => read.mutate(a.id)}>Mark read</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
