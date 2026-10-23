import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BarChart3, Bell, Building2, FilePlus2, FolderKanban, GitMerge, LayoutGrid, LogOut, Monitor, Moon, Search, ShieldCheck, Sun, X,
} from 'lucide-react';
import { api, DEMO, qs } from '../lib/api';
import { useAuth, useLive, useLookups, useTheme, useToast } from '../lib/context';
import { relTime } from '../lib/format';
import type { Alert, OverlapGroup } from '../lib/types';
import { BureauChip, StatusBadge, severityIcon } from './ui';

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_8px_20px_-8px_var(--accent)]', className)}>
      <svg viewBox="0 0 32 32" className="size-5" aria-hidden><path d="M7 23V9h4.4L16 17l4.6-8H25v14h-3.8v-7.4L17.2 22h-2.4l-4-6.4V23z" fill="currentColor" /></svg>
    </span>
  );
}

const initials = (name?: string) => (name ?? '').replace(/^(Prof\.|Dr\.)\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function Layout() {
  const { user } = useAuth();
  const { data: alertSummary } = useQuery({ queryKey: ['alerts-summary'], queryFn: () => api<{ unread: number; critical: number; latest: Alert[] }>('/alerts/summary'), refetchInterval: 60000 });
  const { data: overlaps } = useQuery({ queryKey: ['overlaps', 'open-count'], queryFn: () => api<OverlapGroup[]>('/overlaps?status=open') });

  const nav = [
    { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
    { to: '/cases', label: 'Cases', icon: FolderKanban, end: true },
    { to: '/cases/new', label: 'Register complaint', icon: FilePlus2 },
    { to: '/institutions', label: 'Institutions', icon: Building2 },
    { to: '/overlaps', label: 'Overlaps & duplicates', icon: GitMerge, badge: overlaps?.length },
    { to: '/alerts', label: 'Alerts', icon: Bell, badge: alertSummary?.unread },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Administration', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-full">
      <Rail nav={nav} />
      <div className="flex min-h-full flex-col lg:pl-[104px]">
        <header className="header-fade no-print sticky top-0 isolate z-30 px-3 pt-3 sm:px-6 sm:pt-4">
          <div className="glass mx-auto flex h-14 max-w-[1440px] items-center gap-2 rounded-full pl-2.5 pr-2 sm:gap-3">
            <Link to="/" className="flex shrink-0 items-center gap-2.5 pr-1" aria-label="AICTE ICMS home">
              <LogoMark />
              <span className="hidden leading-tight md:block">
                <span className="block text-sm font-bold tracking-tight">AICTE ICMS</span>
                <span className="block text-[11px] text-ink-3">Complaint Monitoring</span>
              </span>
            </Link>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1">
              <LiveIndicator />
              <ThemeToggle />
              <AlertBell summary={alertSummary} />
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="print-full mx-auto w-full max-w-[1440px] flex-1 px-3 pb-28 pt-5 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
        <footer className="no-print px-6 pb-24 text-center text-[11px] text-muted lg:pb-5">
          {DEMO ? 'Live demo running in your browser · ' : 'Demo build · '}synthetic data: all institutions, officials and complaints are fictional · SIH 2026 · SIH26264 · Team Varangians
        </footer>
      </div>
      <Toasts />
    </div>
  );
}

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; end?: boolean; badge?: number };

/** Floating glass rail on desktop; a bottom dock on phones and tablets. */
function Rail({ nav }: { nav: NavItem[] }) {
  const { logout } = useAuth();
  const item = (n: NavItem, compact = false) => (
    <NavLink key={n.to} to={n.to} end={n.end} aria-label={n.label}
      className={({ isActive }) => clsx('rail-item relative flex shrink-0 items-center justify-center rounded-full transition-all', compact ? 'size-10' : 'size-11',
        isActive ? 'bg-accent text-accent-ink shadow-[0_10px_24px_-8px_var(--accent)]' : 'text-ink-2 hover:bg-surface-3 hover:text-ink')}>
      <n.icon className="size-[19px]" strokeWidth={2} />
      {!!n.badge && (
        <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-critical px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-[var(--panel-solid)]">
          {n.badge > 99 ? '99+' : n.badge}
        </span>
      )}
      <span className="rail-tip glass-pop absolute left-[calc(100%+14px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium text-ink lg:block">{n.label}</span>
    </NavLink>
  );
  return (
    <>
      <nav aria-label="Main" className="no-print glass fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-full p-2 lg:flex">
        {nav.map((n) => item(n))}
        <span className="my-1 h-px w-7 bg-hairline" />
        <button onClick={logout} aria-label="Sign out" className="rail-item relative flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink">
          <LogOut className="size-[19px]" />
          <span className="rail-tip glass-pop absolute left-[calc(100%+14px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium text-ink lg:block">Sign out</span>
        </button>
      </nav>
      <nav aria-label="Main" className="no-print glass fixed bottom-3 left-1/2 z-40 flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full p-1.5 lg:hidden">
        {nav.map((n) => item(n, true))}
      </nav>
    </>
  );
}

function LiveIndicator() {
  const { connected, lastAt, simulator } = useLive();
  return (
    <div className="tile hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs text-ink-2 xl:flex" title={connected ? 'Receiving real-time updates' : 'Reconnecting…'}>
      <span className={clsx('size-2 rounded-full', connected ? 'live-dot bg-good' : 'bg-muted')} />
      {connected ? 'Live' : 'Offline'}
      {lastAt && <span className="text-ink-3">· {relTime(lastAt)}</span>}
      {simulator && <span className="rounded-full bg-accent-soft px-1.5 text-accent-text">demo feed</span>}
    </div>
  );
}

const iconBtn = 'relative flex size-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return <button className={clsx(iconBtn, 'hidden sm:flex')} onClick={() => setTheme(next)} title={`Theme: ${theme} (click for ${next})`} aria-label="Toggle theme"><Icon className="size-[18px]" /></button>;
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, []);
  return { open, setOpen, ref };
}

function AlertBell({ summary }: { summary?: { unread: number; critical: number; latest: Alert[] } }) {
  const { open, setOpen, ref } = usePopover();
  const nav = useNavigate();
  return (
    <div className="relative" ref={ref}>
      <button className={iconBtn} onClick={() => setOpen((o) => !o)} aria-label="Alerts" aria-expanded={open}>
        <Bell className="size-[18px]" />
        {!!summary?.unread && <span className={clsx('absolute right-1 top-1 min-w-[17px] rounded-full px-1 text-center text-[10px] font-bold leading-[17px] text-white', summary.critical ? 'bg-critical' : 'bg-accent-strong')}>{summary.unread > 99 ? '99+' : summary.unread}</span>}
      </button>
      {open && (
        <div className="glass-pop absolute right-0 top-12 z-40 w-[min(92vw,380px)] overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold">Alerts <span className="text-xs font-normal text-ink-3">{summary?.unread ?? 0} unread</span></div>
          <ul className="max-h-96 space-y-1 overflow-y-auto px-2 pb-2">
            {summary?.latest.map((a) => (
              <li key={a.id}>
                <button className={clsx('flex w-full gap-2.5 rounded-2xl px-3 py-2.5 text-left hover:bg-surface-2', !a.read && 'bg-surface-1')}
                  onClick={() => { setOpen(false); api(`/alerts/${a.id}/read`, { method: 'POST' }).catch(() => {}); nav(a.type === 'OVERLAP' ? `/institutions/${a.institution_id}` : a.case_id ? `/cases/${a.case_id}` : '/alerts'); }}>
                  <span className={clsx('mt-0.5', a.severity === 'critical' ? 'text-critical-text' : a.severity === 'serious' ? 'text-serious-text' : a.severity === 'warning' ? 'text-warning-text' : 'text-info-text')}>{severityIcon(a.severity)}</span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm text-ink">{a.title}</span>
                    <span className="text-xs text-ink-3">{relTime(a.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
            {!summary?.latest.length && <li className="px-4 py-6 text-center text-sm text-ink-3">No active alerts</li>}
          </ul>
          <Link to="/alerts" onClick={() => setOpen(false)} className="block border-t border-hairline px-4 py-3 text-center text-sm font-semibold text-accent-text hover:bg-surface-2">View all alerts</Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { bureauName, regionName } = useLookups();
  const { open, setOpen, ref } = usePopover();
  const scope = user?.role === 'admin' ? 'All Bureaus/Cells' : user?.role === 'regional' ? regionName(user.region_code) : bureauName(user?.bureau_code);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Account" aria-expanded={open}
        className="ml-1 flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#ffb36b] to-[#e2621a] text-sm font-bold text-[#2a1203] ring-2 ring-[var(--border)]">
        {initials(user?.name)}
      </button>
      {open && (
        <div className="glass-pop absolute right-0 top-12 z-40 w-72 rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-[#ffb36b] to-[#e2621a] font-bold text-[#2a1203]">{initials(user?.name)}</span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{user?.name}</div>
              <div className="truncate text-xs text-ink-3">{user?.designation}</div>
            </div>
          </div>
          <div className="tile mt-3 rounded-2xl px-3 py-2 text-xs text-ink-2">Scope: {scope}</div>
          <button onClick={logout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3"><LogOut className="size-4" />Sign out</button>
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const { data } = useQuery({
    queryKey: ['search', debounced], enabled: debounced.length >= 2,
    queryFn: () => api<{ cases: Array<{ id: number; case_no: string; subject: string; status: string; bureau_code: string; institution_name: string | null }>; institutions: Array<{ id: number; name: string; aicte_id: string; city: string; state: string; score: number; fuzzy?: boolean }> }>(`/search${qs({ q: debounced })}`),
  });
  const go = (path: string) => { setOpen(false); setQ(''); nav(path); };
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xl md:mx-auto" ref={ref}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) go(`/cases${qs({ q: q.trim() })}`); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Search Case ID, institution, AICTE ID…" aria-label="Search"
        className="h-10 w-full rounded-full border border-hairline bg-surface-1 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
      {open && debounced.length >= 2 && data && (
        <div className="glass-pop absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-3xl p-2">
          {!!data.institutions.length && <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Institutions</div>}
          {data.institutions.map((i) => (
            <button key={i.id} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-surface-2" onClick={() => go(`/institutions/${i.id}`)}>
              <Building2 className="size-4 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{i.name}</span><span className="text-xs text-ink-3">{i.aicte_id} · {i.city}, {i.state}</span></span>
              {i.fuzzy && <span className="shrink-0 text-xs text-ink-3" title="Fuzzy match">≈ {Math.round(i.score * 100)}%</span>}
            </button>
          ))}
          {!!data.cases.length && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Cases</div>}
          {data.cases.map((c) => (
            <button key={c.id} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-surface-2" onClick={() => go(`/cases/${c.id}`)}>
              <FolderKanban className="size-4 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{c.case_no} — {c.subject}</span><span className="truncate text-xs text-ink-3">{c.institution_name ?? 'Unidentified institution'}</span></span>
              <BureauChip code={c.bureau_code} /><StatusBadge status={c.status} />
            </button>
          ))}
          <button className="mt-1 w-full rounded-2xl px-3 py-2 text-left text-sm font-medium text-accent-text hover:bg-surface-2" onClick={() => go(`/cases${qs({ q: debounced })}`)}>Search all cases for “{debounced}” ↵</button>
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToast();
  const nav = useNavigate();
  return (
    <div className="no-print pointer-events-none fixed bottom-20 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2 lg:bottom-5" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={clsx('glass-pop pointer-events-auto rounded-3xl p-3.5', t.tone === 'warning' && 'ring-1 ring-warning/60', t.tone === 'critical' && 'ring-1 ring-critical/60', t.tone === 'good' && 'ring-1 ring-good/50')}>
          <div className="flex items-start gap-2">
            <button className="min-w-0 flex-1 text-left" onClick={() => { if (t.href) nav(t.href); dismiss(t.id); }}>
              <div className="text-sm font-semibold">{t.title}</div>
              {t.body && <div className="mt-0.5 text-sm text-ink-2">{t.body}</div>}
            </button>
            <button className="rounded-full p-1 text-ink-3 hover:bg-surface-2" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X className="size-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
