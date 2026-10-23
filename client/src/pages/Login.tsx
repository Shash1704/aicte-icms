import { useEffect, useState } from 'react';
import { BarChart3, BellRing, GitMerge, ShieldCheck } from 'lucide-react';
import { api, DEMO } from '../lib/api';
import { useAuth } from '../lib/context';
import { Button, ErrorBox, Field, Input } from '../components/ui';
import { LogoMark } from '../components/Layout';
import { Sunburst } from '../components/Illustrations';

interface Demo { username: string; name: string; designation: string; role: string; bureau_code: string | null; region_code: string | null }

const FEATURES = [
  { icon: GitMerge, title: 'Cross-Bureau overlap detection', body: 'Finds complaints on the same institution across RB, PGRC and others, even when names or references differ.' },
  { icon: BellRing, title: 'Timeline (SLA) alerts', body: 'Reminders before prescribed timelines lapse, with escalation prompts.' },
  { icon: BarChart3, title: 'Real-time MIS', body: 'Bureau-, region-, institution- and status-wise reports with ageing and disposal analysis.' },
  { icon: ShieldCheck, title: 'Accountability', body: 'Complete action history with officer, timestamp, remarks and documents.' },
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<Demo[]>([]);
  useEffect(() => { api<Demo[]>('/auth/demo-accounts').then(setDemo).catch(() => {}); }, []);

  const submit = async (u = username, p = password) => {
    setBusy(true); setError(null);
    try { await login(u, p); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-3 sm:p-8">
      <div className="grid w-full max-w-[1180px] overflow-hidden rounded-[30px] bg-main shadow-[var(--shell-shadow)] lg:grid-cols-[1.05fr_auto_1fr]">
        <div className="hidden flex-col p-10 lg:flex">
          <div className="eyebrow flex items-center justify-between text-ink-3">
            <span>All India Council for Technical Education</span>
            <span>SIH26264</span>
          </div>
          <h1 className="mt-14 text-[68px] leading-[0.95] text-ink">ICMS</h1>
          <p className="mt-5 max-w-md font-display text-[26px] leading-snug text-ink">
            Every institution complaint, <em>one window.</em>
          </p>
          <p className="mt-3 max-w-md text-sm text-ink-3">Integrated monitoring for the Regulation Bureau, PGRC, other Bureaus/Cells and Regional Offices.</p>
          <ul className="mt-10 grid max-w-xl grid-cols-2 gap-x-8 gap-y-6">
            {FEATURES.map((f) => (
              <li key={f.title} className="border-t border-[var(--axis)] pt-3">
                <f.icon className="size-4 text-ink-2" strokeWidth={1.6} />
                <div className="mt-2 text-sm font-medium">{f.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-ink-3">{f.body}</div>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center gap-3 pt-10 text-ink-3">
            <Sunburst className="size-8" />
            <span className="text-xs leading-relaxed">Smart India Hackathon 2026<br />Team Varangians</span>
          </div>
        </div>
        <div className="my-10 hidden w-px bg-[var(--axis)] lg:block" aria-hidden />

        <div className="w-full p-6 sm:p-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="size-10" />
            <div>
              <div className="eyebrow text-ink-3">AICTE</div>
              <div className="font-display text-2xl">Complaint Monitoring</div>
            </div>
          </div>
          <form className="mx-auto max-w-md" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="eyebrow text-ink-3">Authorised officials</div>
            <h2 className="mt-2 text-[40px] leading-none">Sign in</h2>
            {DEMO && <p className="mt-4 rounded-2xl border border-[var(--axis)] px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">Live demo: runs entirely in your browser with synthetic data. Pick a demo account below.</p>}
            <div className="mt-6 space-y-4">
              <Field label="Username"><Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
              <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              <ErrorBox error={error} />
              <Button variant="primary" className="h-11 w-full" loading={busy} type="submit">Sign in</Button>
            </div>
          </form>
          {!!demo.length && (
            <div className="mx-auto mt-8 max-w-md">
              <div className="eyebrow mb-3 text-ink-3">Demo accounts · password <code className="rounded-md bg-surface-2 px-1.5 py-0.5 normal-case tracking-normal">Aicte@2026</code></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {demo.map((d) => (
                  <button key={d.username} onClick={() => submit(d.username, 'Aicte@2026')} disabled={busy}
                    className="glass rounded-[18px] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--ink)]">
                    <div className="text-sm font-medium">{d.designation}</div>
                    <div className="text-xs text-ink-3">{d.username} · {d.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
