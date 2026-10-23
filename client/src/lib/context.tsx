import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, DEMO, getToken, setToken, setUnauthorizedHandler } from './api';
import type { Meta, User } from './types';

// ---------------- Auth ----------------
interface AuthCtx { user: User | null; ready: boolean; login: (u: string, p: string) => Promise<void>; logout: () => void }
const AuthContext = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();
  const logout = useCallback(() => { setToken(null); setUser(null); qc.clear(); }, [qc]);
  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) { setReady(true); return; }
    api<User>('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, [logout]);
  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', { body: { username, password } });
    setToken(r.token);
    setUser(r.user);
  }, []);
  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

// ---------------- Reference data ----------------
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: Infinity });
}
export function useLookups() {
  const { data } = useMeta();
  return useMemo(() => ({
    meta: data,
    bureauName: (c?: string | null) => data?.bureaus.find((b) => b.code === c)?.name ?? c ?? '—',
    categoryName: (c?: string | null) => data?.categories.find((x) => x.code === c)?.name ?? c ?? '—',
    regionName: (c?: string | null) => { const r = data?.regions.find((x) => x.code === c); return r ? `${r.name} (${r.office})` : c ?? '—'; },
    actionLabel: (c: string) => data?.actionTypes.find((a) => a.code === c)?.label ?? c,
  }), [data]);
}

// ---------------- Toasts ----------------
export interface Toast { id: number; title: string; body?: string; tone?: 'info' | 'good' | 'warning' | 'critical'; href?: string }
const ToastContext = createContext<{ push: (t: Omit<Toast, 'id'>) => void; toasts: Toast[]; dismiss: (id: number) => void }>(null as never);
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = idRef.current++;
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);
  return <ToastContext.Provider value={{ push, toasts, dismiss }}>{children}</ToastContext.Provider>;
}

// ---------------- Live updates (SSE) ----------------
export interface LiveEvent { type: string; case_id?: number; case_no?: string; action?: string; status?: string; bureau?: string; by?: string; overlap?: boolean; at: string; other?: string; running?: boolean; count?: number }
const LiveContext = createContext<{ connected: boolean; events: LiveEvent[]; simulator: boolean; lastAt: string | null }>({ connected: false, events: [], simulator: false, lastAt: null });
export const useLive = () => useContext(LiveContext);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { push } = useToast();
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [simulator, setSimulator] = useState(false);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const onUpdate = (evt: LiveEvent) => {
      setLastAt(evt.at);
      if (evt.type === 'simulator') setSimulator(!!evt.running);
      setEvents((all) => [evt, ...all].slice(0, 30));
      // Batch refetches so a burst of events causes one refresh.
      if (pending.current) window.clearTimeout(pending.current);
      pending.current = window.setTimeout(() => { qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'meta' }); }, 400);
      if (evt.type === 'case.created' && evt.overlap) {
        push({ tone: 'warning', title: 'Potential Overlapping Cases – Coordination Required', body: `${evt.case_no} registered with ${evt.bureau}; the institution already has active cases with other Bureaus/Cells.`, href: `/cases/${evt.case_id}` });
      } else if (evt.type === 'case.created') {
        push({ tone: 'info', title: `New complaint ${evt.case_no}`, body: `Registered with ${evt.bureau}${evt.by ? ` by ${evt.by}` : ''}.`, href: `/cases/${evt.case_id}` });
      }
    };

    // Demo build: the server runs in this tab, so subscribe to its event bus directly.
    if (DEMO) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      import('../demo/server.js').then(({ subscribeLive }) => subscribeLive((e) => onUpdate(e as unknown as LiveEvent))).then((sub) => {
        if (cancelled) return sub.unsubscribe();
        stop = sub.unsubscribe;
        setConnected(true);
        setSimulator(sub.simulator);
      });
      return () => { cancelled = true; stop?.(); setConnected(false); };
    }

    let es: EventSource | null = null;
    let retry: number | undefined;
    const connect = () => {
      es = new EventSource(`/api/events?token=${encodeURIComponent(getToken() || '')}`);
      es.addEventListener('hello', (e) => { setConnected(true); setSimulator(JSON.parse((e as MessageEvent).data).simulator); });
      es.addEventListener('update', (e) => onUpdate(JSON.parse((e as MessageEvent).data) as LiveEvent));
      es.onerror = () => { setConnected(false); es?.close(); retry = window.setTimeout(connect, 5000); };
    };
    connect();
    return () => { es?.close(); window.clearTimeout(retry); setConnected(false); };
  }, [user, qc, push]);

  return <LiveContext.Provider value={{ connected, events, simulator, lastAt }}>{children}</LiveContext.Provider>;
}

// ---------------- Theme ----------------
// "system" resolves to light/dark from the OS; data-theme is always set to a concrete value.
export type ThemeChoice = 'light' | 'dark' | 'system';
// New key for the dark redesign, so everyone starts on its dark default.
const THEME_KEY = 'icms.theme.v4';
const resolveTheme = (t: ThemeChoice) => (t === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t);

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    try { return (localStorage.getItem(THEME_KEY) as ThemeChoice | null) ?? 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    const apply = () => document.documentElement.setAttribute('data-theme', resolveTheme(theme));
    apply();
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  return { theme, setTheme: setThemeState };
}
