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
    <div className="flex min-h-screen items-center justify-center p-3 sm:p-8">
      <div className="w-full max-w-[1120px]">
        <div className="eyebrow mb-3 flex justify-between px-1 text-ink-3"><span>.01 · Sign in</span><span>SIH26264 · Team Varangians</span></div>
        <div className="grid overflow-hidden rounded-[10px] bg-main shadow-[var(--shell-shadow)] lg:grid-cols-[1.1fr_1fr]">
          <div className="relative hidden min-h-[560px] flex-col p-10 lg:flex">
            <div className="flex items-start justify-between">
              <span className="text-[14px] font-bold leading-[1.05] tracking-[0.18em]">IC<br />MS</span>
              <span className="eyebrow text-ink-3">AICTE</span>
            </div>
            <div className="my-auto text-center">
              <div className="eyebrow text-ink-3">— One window —</div>
              <h1 className="mt-3 text-[84px] font-bold leading-none tracking-[0.1em]">ICMS</h1>
              <p className="eyebrow mt-4 text-ink-3">Integrated complaint monitoring</p>
            </div>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-5">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-3">
                  <f.icon className="mt-0.5 size-4 shrink-0 text-ink-2" strokeWidth={1.6} />
                  <div className="text-xs leading-relaxed text-ink-3"><span className="font-medium text-ink-2">{f.title}.</span> {f.body}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass m-0 rounded-none px-6 py-10 sm:px-12 lg:m-4 lg:rounded-[8px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <LogoMark className="size-10" />
              <div>
                <div className="eyebrow text-ink-3">AICTE</div>
                <div className="text-lg font-semibold uppercase tracking-[0.1em]">ICMS</div>
              </div>
            </div>
            <form className="mx-auto max-w-sm" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <h2 className="text-center text-[22px] tracking-[0.14em]">Sign in</h2>
              <p className="eyebrow mt-2 text-center text-[9.5px] text-ink-3">Authorised AICTE officials only</p>
              {DEMO && <p className="mt-6 border-l border-[var(--axis)] pl-3 text-xs leading-relaxed text-ink-3">Live demo: runs entirely in your browser with synthetic data. Pick a demo account below.</p>}
              <div className="mt-6 space-y-5">
                <Field label="Username"><Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
                <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
                <ErrorBox error={error} />
                <div className="flex justify-center pt-2"><Button variant="primary" className="h-11 px-8" loading={busy} type="submit">Sign in →</Button></div>
              </div>
            </form>
            {!!demo.length && (
              <div className="mx-auto mt-10 max-w-sm">
                <div className="eyebrow mb-3 text-ink-3">Demo accounts · password <code className="normal-case tracking-normal text-ink-2">Aicte@2026</code></div>
                <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                  {demo.map((d) => (
                    <button key={d.username} onClick={() => submit(d.username, 'Aicte@2026')} disabled={busy}
                      className="group flex w-full items-center justify-between gap-3 py-2.5 text-left">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink-2 group-hover:text-ink">{d.designation}</span>
                        <span className="block truncate text-[11px] text-ink-3">{d.username} · {d.name}</span>
                      </span>
                      <span className="text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
