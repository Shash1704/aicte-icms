import { useEffect, useState } from 'react';
import { BarChart3, BellRing, GitMerge, ShieldCheck } from 'lucide-react';
import { api, DEMO } from '../lib/api';
import { useAuth } from '../lib/context';
import { Button, ErrorBox, Field, Input } from '../components/ui';
import { LogoMark } from '../components/Layout';

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
    <div className="mx-auto grid min-h-screen max-w-[1280px] items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:block">
        <div className="flex items-center gap-3">
          <LogoMark className="size-11" />
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-3">All India Council for Technical Education</div>
        </div>
        <h1 className="mt-8 max-w-xl text-[44px] font-bold leading-[1.08] tracking-tight">
          Every institution complaint, <span className="bg-gradient-to-r from-[#c9c0ff] to-[var(--accent)] bg-clip-text text-transparent">one window.</span>
        </h1>
        <p className="mt-4 max-w-lg text-ink-2">Integrated monitoring for the Regulation Bureau, PGRC, other Bureaus/Cells and Regional Offices.</p>
        <ul className="mt-10 grid max-w-xl grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="glass rounded-[22px] p-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-text"><f.icon className="size-5" /></span>
              <div className="mt-3 text-sm font-semibold">{f.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-ink-3">{f.body}</div>
            </li>
          ))}
        </ul>
        <div className="mt-8 text-xs text-ink-3">Smart India Hackathon 2026 · Problem Statement SIH26264 · Team Varangians</div>
      </div>

      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <LogoMark className="size-11" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-ink-3">AICTE</div>
            <div className="text-xl font-bold tracking-tight">Integrated Complaint Monitoring</div>
          </div>
        </div>
        <form className="glass rounded-[32px] p-7" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-ink-3">For authorised AICTE officials only.</p>
          {DEMO && <p className="-mt-3 mb-5 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-xs leading-relaxed text-accent-text">Live demo: runs entirely in your browser with synthetic data. Pick a demo account below.</p>}
          <div className="space-y-4">
            <Field label="Username"><Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <ErrorBox error={error} />
            <Button variant="primary" className="h-11 w-full" loading={busy} type="submit">Sign in</Button>
          </div>
        </form>
        {!!demo.length && (
          <div className="mt-6">
            <div className="mb-2.5 px-1 text-xs font-medium text-ink-3">Demo accounts · password <code className="rounded-md bg-surface-2 px-1.5 py-0.5">Aicte@2026</code> · click to sign in</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {demo.map((d) => (
                <button key={d.username} onClick={() => submit(d.username, 'Aicte@2026')} disabled={busy}
                  className="glass rounded-[20px] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:ring-1 hover:ring-[var(--accent)]">
                  <div className="text-sm font-semibold">{d.designation}</div>
                  <div className="text-xs text-ink-3">{d.username} · {d.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
