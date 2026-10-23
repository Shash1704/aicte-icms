import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BarChart3, Bell, Building2, Clock, FolderKanban, LayoutGrid, LogOut, Menu, Monitor, Moon, Search, ShieldCheck, Sun, X,
} from 'lucide-react';
import { api, DEMO, qs } from '../lib/api';
import { useAuth, useLive, useLookups, useTheme, useToast } from '../lib/context';
import { relTime } from '../lib/format';
import type { Alert, OverlapGroup } from '../lib/types';
import { BureauChip, StatusBadge, severityIcon } from './ui';
import { bureauColor } from '../lib/colors';

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
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => { setDrawer(false); document.getElementById('main-scroll')?.scrollTo({ top: 0 }); }, [loc.pathname]);
  const { data: alertSummary } = useQuery({ queryKey: ['alerts-summary'], queryFn: () => api<{ unread: number; critical: number; latest: Alert[] }>('/alerts/summary'), refetchInterval: 60000 });
  const { data: overlaps } = useQuery({ queryKey: ['overlaps', 'open-count'], queryFn: () => api<OverlapGroup[]>('/overlaps?status=open') });
  const { data: activeCount } = useQuery({ queryKey: ['cases', 'active-count'], queryFn: () => api<{ total: number }>('/cases?active=1&size=5').then((r) => r.total) });

  const groups: NavGroup[] = [
    { items: [{ to: '/', label: 'Dashboard', icon: LayoutGrid, end: true }] },
    {
      head: { label: 'Cases', icon: FolderKanban },
      items: [
        { to: '/cases', label: 'All cases', end: true, badge: activeCount },
        { to: '/cases/new', label: 'Register complaint' },
        { to: '/overlaps', label: 'Overlaps', badge: overlaps?.length },
        { to: '/alerts', label: 'Alerts', badge: alertSummary?.unread },
      ],
    },
    { items: [
      { to: '/institutions', label: 'Institutions', icon: Building2 },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Administration', icon: ShieldCheck }] : []),
    ] },
  ];

  return (
    <div className="min-h-screen lg:p-4">
      <div id="app-shell" className="lg:flex lg:h-[calc(100vh-32px)] lg:overflow-hidden lg:rounded-[32px] lg:bg-sidebar lg:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
        <aside className="no-print hidden w-[252px] shrink-0 lg:block"><Sidebar groups={groups} /></aside>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 left-0 w-[272px] bg-sidebar shadow-2xl"><Sidebar groups={groups} mobile onClose={() => setDrawer(false)} /></div>
          </div>
        )}
        <div id="main-scroll" className="relative flex min-h-screen min-w-0 flex-1 flex-col bg-main lg:my-4 lg:mr-4 lg:min-h-0 lg:overflow-y-auto lg:rounded-[28px]">
          <header className="header-fade no-print sticky top-0 isolate z-30 px-4 pb-2 pt-4 sm:px-7 sm:pt-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <button className={clsx(iconBtn, 'lg:hidden')} onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="size-5" /></button>
              <LiveIndicator />
              <GlobalSearch />
              <div className="ml-auto flex items-center gap-1">
                <ThemeToggle />
                <AlertBell summary={alertSummary} />
                <UserMenu />
              </div>
            </div>
          </header>
          <main className="print-full w-full flex-1 px-4 pb-10 pt-3 sm:px-7">
            <Outlet />
          </main>
          <footer className="no-print px-6 pb-5 text-center text-[11px] text-muted">
            {DEMO ? 'Live demo running in your browser · ' : 'Demo build · '}synthetic data: all institutions, officials and complaints are fictional · SIH 2026 · SIH26264 · Team Varangians
          </footer>
        </div>
      </div>
      <Toasts />
    </div>
  );
}

type NavLeaf = { to: string; label: string; icon?: typeof LayoutGrid; end?: boolean; badge?: number };
type NavGroup = { head?: { label: string; icon: typeof LayoutGrid }; items: NavLeaf[] };

/** Text sidebar like the reference: grouped items, count pills, and an active item that merges into the main panel. */
function Sidebar({ groups, mobile, onClose }: { groups: NavGroup[]; mobile?: boolean; onClose?: () => void }) {
  const { user, logout } = useAuth();
  const { meta } = useLookups();
  const leaf = (n: NavLeaf, sub: boolean) => (
    <NavLink key={n.to} to={n.to} end={n.end}
      className={({ isActive }) => clsx('relative flex items-center gap-3 py-2.5 pr-4 transition-colors',
        sub ? 'pl-[52px] text-[13px]' : 'pl-6 text-[15px]',
        isActive ? (mobile ? 'mr-3 rounded-r-full bg-accent-soft font-semibold text-ink' : 'nav-merge font-semibold text-ink') : 'text-ink-2 hover:text-ink')}>
      {n.icon && <n.icon className="size-[18px] shrink-0" strokeWidth={1.8} />}
      <span className="flex-1">{n.label}</span>
      {!!n.badge && <span className="min-w-8 rounded-full bg-accent-soft px-2 py-0.5 text-center text-[11px] font-semibold text-accent-text tnum">{n.badge > 999 ? '999+' : n.badge}</span>}
    </NavLink>
  );
  return (
    <div className="flex h-full flex-col py-6">
      <div className="flex items-center justify-between pl-6 pr-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label="AICTE ICMS home">
          <LogoMark />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">AICTE ICMS</span>
            <span className="block text-[11px] text-ink-3">Complaint Monitoring</span>
          </span>
        </Link>
        {mobile && <button className={iconBtn} onClick={onClose} aria-label="Close menu"><X className="size-5" /></button>}
      </div>
      <nav aria-label="Main" className="mt-3 flex-1 space-y-1 overflow-y-auto pb-6 pt-6">
        {groups.map((g, gi) => (
          <div key={gi} className={clsx(gi > 0 && 'pt-2')}>
            {g.head && (
              <div className="flex items-center gap-3 py-2.5 pl-6 text-[15px] font-semibold text-ink">
                <g.head.icon className="size-[18px] text-accent-text" strokeWidth={1.8} />{g.head.label}
              </div>
            )}
            {g.items.map((n) => leaf(n, !!g.head))}
          </div>
        ))}
        <div className="pt-6">
          <div className="pb-3 pl-6 text-[15px] text-ink-2">Bureaus/Cells</div>
          <div className="flex flex-wrap gap-2 pl-6 pr-6">
            {meta?.bureaus.map((b) => (
              <Link key={b.code} to={`/cases?bureau=${b.code}&active=1`} title={`${b.name}: active cases`}
                className="flex size-9 items-center justify-center rounded-full text-[10px] font-bold text-ink ring-2 ring-[var(--sidebar)] transition hover:-translate-y-0.5"
                style={{ background: `color-mix(in srgb, ${bureauColor(b.code)} 38%, var(--sidebar))` }}>
                {b.code}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-surface-1 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#b4a9ff] to-[#6450e6] text-xs font-bold text-white">{initials(user?.name)}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold">{user?.name}</span>
          <span className="block truncate text-[11px] text-ink-3">{user?.designation}</span>
        </span>
        <button onClick={logout} className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Sign out" title="Sign out"><LogOut className="size-4" /></button>
      </div>
    </div>
  );
}

function LiveIndicator() {
  const { connected, lastAt, simulator } = useLive();
  return (
    <div className="glass hidden shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs text-ink-2 md:flex" title={connected ? 'Receiving real-time updates' : 'Reconnecting…'}>
      <Clock className="size-4 text-accent-text" />
      <span className={clsx('size-1.5 rounded-full', connected ? 'live-dot bg-good' : 'bg-muted')} />
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
        className="ml-1 flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#b4a9ff] to-[#6450e6] text-sm font-bold text-white ring-2 ring-[var(--border)]">
        {initials(user?.name)}
      </button>
      {open && (
        <div className="glass-pop absolute right-0 top-12 z-40 w-72 rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-[#b4a9ff] to-[#6450e6] font-bold text-white">{initials(user?.name)}</span>
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
        id="global-search" className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--panel)] pl-10 pr-4 text-sm text-ink shadow-[var(--shadow)] placeholder:text-muted focus:border-accent focus:outline-none" />
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
    <div className="no-print pointer-events-none fixed bottom-5 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
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
