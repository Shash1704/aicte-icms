import { StrictMode, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import { AuthProvider, LiveProvider, ToastProvider, useAuth, useTheme } from './lib/context';
import Layout, { LogoMark } from './components/Layout';
import Login from './pages/Login';
import { Spinner } from './components/ui';
import { DEMO } from './lib/api';
import { LoaderCircle } from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Cases = lazy(() => import('./pages/Cases'));
const CaseDetail = lazy(() => import('./pages/CaseDetail'));
const NewCase = lazy(() => import('./pages/NewCase'));
const Institutions = lazy(() => import('./pages/Institutions'));
const InstitutionDetail = lazy(() => import('./pages/InstitutionDetail'));
const Overlaps = lazy(() => import('./pages/Overlaps'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Reports = lazy(() => import('./pages/Reports'));
const Admin = lazy(() => import('./pages/Admin'));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } } });

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="orb" style={{ width: 520, height: 520, right: -120, top: -140, background: 'radial-gradient(circle, rgba(255,128,40,.55), transparent 70%)' }} />
      <div className="orb" style={{ width: 420, height: 420, left: -140, bottom: -120, background: 'radial-gradient(circle, rgba(240,110,40,.35), transparent 70%)', animationDelay: '-9s' }} />
    </div>
  );
}

/** Demo build: waits for the in-browser server (and first-visit data generation) before rendering the app. */
function DemoGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!DEMO);
  const [status, setStatus] = useState('Starting…');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!DEMO) return;
    let off: (() => void) | undefined;
    import('./demo/server.js')
      .then((m) => { off = m.onStatus(setStatus); return m.getDemoServer(); })
      .then(() => setReady(true))
      .catch((e) => setError(String(e?.message ?? e)));
    return () => off?.();
  }, []);
  if (ready) return <>{children}</>;
  return (
    <>
      <Backdrop />
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass w-full max-w-sm rounded-[32px] p-8 text-center">
          <LogoMark className="mx-auto size-12" />
          <h1 className="mt-4 text-xl font-bold tracking-tight">AICTE ICMS · Live demo</h1>
          {error ? (
            <p className="mt-3 text-sm text-critical-text">Could not start the demo: {error}</p>
          ) : (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-ink-2"><LoaderCircle className="size-4 animate-spin" />{status}</p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink-3">The whole system runs inside your browser with synthetic data. The first visit takes a few seconds; later visits are instant.</p>
        </div>
      </div>
    </>
  );
}

function Gate() {
  const { user, ready } = useAuth();
  useTheme();
  if (!ready) return <><Backdrop /><Spinner label="Starting…" /></>;
  if (!user) return <><Backdrop /><Login /></>;
  return (
    <LiveProvider>
      <Backdrop />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="cases" element={<Cases />} />
            <Route path="cases/new" element={<NewCase />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="institutions" element={<Institutions />} />
            <Route path="institutions/:id" element={<InstitutionDetail />} />
            <Route path="overlaps" element={<Overlaps />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="reports" element={<Reports />} />
            <Route path="admin" element={user.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </Suspense>
    </LiveProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <ToastProvider>
          <DemoGate>
            <AuthProvider>
              <Gate />
            </AuthProvider>
          </DemoGate>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
