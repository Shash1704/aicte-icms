import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, StepForward } from 'lucide-react';
import { api, DEMO } from '../lib/api';
import { useLookups } from '../lib/context';
import { fmtDateTime } from '../lib/format';
import { BureauChip, Button, Card, Field, PageHeader, Select, Spinner, Tabs } from '../components/ui';

interface AuditRow { id: number; at: string; user_name: string | null; username: string | null; action: string; entity: string | null; entity_id: string | null; details: string | null; ip: string | null }

export default function Admin() {
  const [tab, setTab] = useState<'system' | 'audit' | 'users'>('system');
  return (
    <div>
      <PageHeader title="Administration" subtitle="Live demo feed, audit trail and user directory." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'system', label: 'Live demo feed' }, { value: 'audit', label: 'Audit trail' }, { value: 'users', label: 'Users & roles' }]} />
      {tab === 'system' && <Simulator />}
      {tab === 'system' && DEMO && <DemoReset />}
      {tab === 'audit' && <Audit />}
      {tab === 'users' && <Users />}
    </div>
  );
}

function Simulator() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['simulator'], queryFn: () => api<{ running: boolean; intervalMs: number }>('/simulator') });
  const [interval, setIntervalMs] = useState('15000');
  const toggle = useMutation({ mutationFn: (running: boolean) => api('/simulator', { body: { running, intervalMs: Number(interval) } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['simulator'] }) });
  const tick = useMutation({ mutationFn: () => api('/simulator/tick', { method: 'POST' }) });
  return (
    <Card title="Live intake simulator" subtitle="For demonstrations: registers new complaints (often on institutions that already have cases, so overlaps appear live) and moves existing cases forward. Every connected dashboard updates in real time.">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Interval"><Select value={interval} onChange={(e) => setIntervalMs(e.target.value)} className="w-40"><option value="8000">Every 8 seconds</option><option value="15000">Every 15 seconds</option><option value="30000">Every 30 seconds</option><option value="60000">Every minute</option></Select></Field>
        {data?.running
          ? <Button variant="danger" loading={toggle.isPending} onClick={() => toggle.mutate(false)}><Pause className="size-4" />Stop feed</Button>
          : <Button variant="primary" loading={toggle.isPending} onClick={() => toggle.mutate(true)}><Play className="size-4" />Start feed</Button>}
        <Button loading={tick.isPending} onClick={() => tick.mutate()}><StepForward className="size-4" />Generate one event</Button>
        <span className="text-sm text-ink-3">Status: {data?.running ? `running (every ${Math.round(data.intervalMs / 1000)}s)` : 'stopped'}</span>
      </div>
    </Card>
  );
}

function DemoReset() {
  const [busy, setBusy] = useState(false);
  return (
    <Card className="mt-4" title="Demo data" subtitle="This demo keeps its data in your browser. Resetting regenerates the original synthetic data set.">
      <Button variant="danger" loading={busy} onClick={async () => { setBusy(true); const m = await import('../demo/server.js'); await m.resetDemoData(); }}>Reset demo data</Button>
    </Card>
  );
}

function Audit() {
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => api<AuditRow[]>('/audit?limit=300') });
  if (isLoading) return <Spinner />;
  return (
    <Card bodyClass="p-0" title="Audit trail" subtitle="Every sign-in, case action, export and document download is logged.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b border-hairline bg-surface-1 text-left text-xs text-ink-3"><tr><th className="px-4 py-2 font-medium">When</th><th className="py-2 font-medium">User</th><th className="py-2 font-medium">Action</th><th className="py-2 font-medium">Entity</th><th className="px-4 py-2 font-medium">Details</th></tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id} className="border-b border-hairline last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-ink-2">{fmtDateTime(r.at)}</td>
                <td className="py-2">{r.user_name ?? <span className="text-ink-3">{r.action.startsWith('auth') ? r.entity_id : 'system'}</span>}</td>
                <td className="py-2"><code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{r.action}</code></td>
                <td className="py-2 text-ink-2">{r.entity} {r.entity_id}</td>
                <td className="max-w-md truncate px-4 py-2 text-xs text-ink-3" title={r.details ?? ''}>{r.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Users() {
  const { meta, regionName } = useLookups();
  return (
    <Card bodyClass="p-0" title="Users & roles" subtitle="Demo password for all accounts: Aicte@2026">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-hairline bg-surface-1 text-left text-xs text-ink-3"><tr><th className="px-4 py-2 font-medium">Name</th><th className="py-2 font-medium">Designation</th><th className="py-2 font-medium">Role</th><th className="py-2 font-medium">Bureau/Cell</th><th className="px-4 py-2 font-medium">Region</th></tr></thead>
          <tbody>
            {meta?.users.map((u) => (
              <tr key={u.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-2 font-medium">{u.name}</td><td className="py-2 text-ink-2">{u.designation}</td>
                <td className="py-2 text-ink-2">{meta.roles[u.role]}</td><td className="py-2"><BureauChip code={u.bureau_code} /></td><td className="px-4 py-2 text-ink-2">{u.region_code ? regionName(u.region_code) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
