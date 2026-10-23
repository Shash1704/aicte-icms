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
      <div className="grid w-full max-w-[1120px] gap-4 rounded-[28px] bg-main p-3 shadow-[var(--shell-shadow)] sm:p-4 lg:grid-cols-[1fr_1fr]">
        <div className="ink-card hidden flex-col rounded-[22px] p-9 lg:flex">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-[#1d1d1f]">
              <svg viewBox="0 0 32 32" className="size-5" aria-hidden><path d="M7 23V9h4.4L16 17l4.6-8H25v14h-3.8v-7.4L17.2 22h-2.4l-4-6.4V23z" fill="currentColor" /></svg>
            </span>
            <span className="text-xs text-white/75">All India Council for Technical Education</span>
          </div>
          <h1 className="mt-14 max-w-md text-[40px] font-bold leading-[1.08]">Every institution complaint, in one place.</h1>
          <p className="mt-3 max-w-sm text-sm text-white/75">One shared view for the Regulation Bureau, PGRC, other Bureaus/Cells and Regional Offices.</p>
          <ul className="mt-auto grid grid-cols-2 gap-3 pt-10">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-[18px] bg-white/10 p-4 backdrop-blur-sm">
                <f.icon className="size-4" />
                <div className="mt-2 text-[13px] font-medium">{f.title}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full px-3 py-6 sm:px-8 sm:py-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="size-10" />
            <div>
              <div className="text-xs text-ink-3">AICTE</div>
              <div className="text-lg font-semibold">Complaint Monitoring</div>
            </div>
          </div>
          <form className="mx-auto max-w-md" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <h2 className="text-[30px] font-bold leading-tight">Sign in</h2>
            <p className="mt-1 text-sm text-ink-3">For authorised AICTE officials only.</p>
            {DEMO && <p className="mt-4 rounded-[14px] bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">Live demo: runs entirely in your browser with synthetic data. Pick a demo account below.</p>}
            <div className="mt-6 space-y-4">
              <Field label="Username"><Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
              <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              <ErrorBox error={error} />
              <Button variant="primary" className="h-11 w-full" loading={busy} type="submit">Sign in</Button>
            </div>
          </form>
          {!!demo.length && (
            <div className="mx-auto mt-8 max-w-md">
              <div className="mb-3 text-xs font-medium text-ink-3">Demo accounts · password <code className="rounded-md bg-surface-2 px-1.5 py-0.5">Aicte@2026</code> · click to sign in</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {demo.map((d) => (
                  <button key={d.username} onClick={() => submit(d.username, 'Aicte@2026')} disabled={busy}
                    className="rounded-[16px] bg-surface-2 px-4 py-3 text-left transition hover:bg-surface-3">
                    <div className="text-sm font-medium">{d.designation}</div>
                    <div className="text-xs text-ink-3">{d.username} · {d.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mx-auto mt-8 max-w-md text-xs text-ink-3">Smart India Hackathon 2026 · SIH26264 · Team Varangians</p>
        </div>
      </div>
    </div>
  );
}
