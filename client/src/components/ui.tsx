import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertOctagon, AlertTriangle, ArrowRightLeft, CheckCircle2, CircleDashed, Clock, Info, Loader2, LoaderCircle, TrendingUp, X, XCircle,
} from 'lucide-react';
import { bureauColor, STATUS_COLOR } from '../lib/colors';
import type { SlaState, Severity, Status } from '../lib/types';

export function Card({ title, subtitle, actions, children, className, bodyClass, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string }) {
  return (
    <section id={id} className={clsx('glass rounded-[10px]', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-5 pb-2 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-5', (title || actions) && 'pt-3', bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: Array<{ label: string; to?: string }> }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs && (
          <nav className="eyebrow mb-2 flex flex-wrap items-center gap-1.5 text-ink-3">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span>/</span>}
                {c.to ? <Link to={c.to} className="hover:text-accent-text hover:underline">{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[24px] leading-tight text-ink sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', className, loading, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[4px] font-medium uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[10px]' : 'h-10 px-5 text-[11px]',
        variant === 'primary' && 'btn-raised hover:brightness-125',
        variant === 'secondary' && 'border border-[var(--axis)] text-ink hover:border-ink',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'bg-critical text-white shadow-[0_10px_26px_-10px_var(--critical)] hover:brightness-110',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className, required }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={clsx('block', className)}>
      <span className="eyebrow mb-0.5 block text-ink-3">{label}{required && <span className="text-critical-text"> *</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
const ctlBase = 'border-0 border-b border-[var(--axis)] bg-transparent px-1 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-ink focus:outline-none';
// Full width unless the caller sets its own width.
const ctl = (className?: string) => clsx(ctlBase, !/(^|\s)(w-|min-w-)/.test(className ?? '') && 'w-full', className);
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(ctl(className), 'h-10 rounded-none')} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx(ctl(className), 'rounded-none py-2.5')} />;
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(ctl(className), 'h-10 rounded-none pr-6')}>{children}</select>;

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3"><LoaderCircle className="size-5 animate-spin" />{label}</div>;
}
export function Empty({ icon, title, body }: { icon?: ReactNode; title: string; body?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-2 text-muted">{icon ?? <CircleDashed className="size-8" />}</div>
      <p className="font-medium text-ink-2">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-ink-3">{body}</p>}
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="rounded-lg border border-critical/30 bg-critical-soft px-3.5 py-2.5 text-sm text-critical-text">{(error as Error).message || String(error)}</div>;
}

// ---------- badges ----------
export function BureauChip({ code, full, name }: { code?: string | null; full?: boolean; name?: string }) {
  if (!code) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2" title={name}>
      <span className="size-2 rounded-full" style={{ background: bureauColor(code) }} />
      {full && name ? name : code}
    </span>
  );
}

const STATUS_ICON: Record<string, ReactNode> = {
  Pending: <Clock className="size-3.5" />, 'Under Process': <TrendingUp className="size-3.5" />, Transferred: <ArrowRightLeft className="size-3.5" />,
  Escalated: <AlertOctagon className="size-3.5" />, Disposed: <CheckCircle2 className="size-3.5" />,
};
export function StatusBadge({ status }: { status: Status | string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">
      <span style={{ color: STATUS_COLOR[status] }}>{STATUS_ICON[status]}</span>
      {status}
    </span>
  );
}

const SLA_META: Record<SlaState, { label: string; cls: string; icon: ReactNode }> = {
  'on-track': { label: 'On track', cls: 'bg-good-soft text-good-text', icon: <CheckCircle2 className="size-3.5" /> },
  approaching: { label: 'Due soon', cls: 'bg-warning-soft text-warning-text', icon: <Clock className="size-3.5" /> },
  breached: { label: 'Overdue', cls: 'bg-critical-soft text-critical-text', icon: <AlertTriangle className="size-3.5" /> },
  met: { label: 'Within timeline', cls: 'bg-good-soft text-good-text', icon: <CheckCircle2 className="size-3.5" /> },
  missed: { label: 'Disposed late', cls: 'bg-serious-soft text-serious-text', icon: <XCircle className="size-3.5" /> },
};
export function SlaBadge({ state, daysLeft }: { state?: SlaState; daysLeft?: number }) {
  if (!state) return null;
  const m = SLA_META[state];
  const extra = daysLeft === undefined || state === 'met' || state === 'missed' ? '' : state === 'breached' ? ` ${-daysLeft}d` : ` · ${daysLeft}d left`;
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', m.cls)}>{m.icon}{m.label}{extra}</span>;
}

const SEV: Record<Severity, { cls: string; icon: ReactNode; label: string }> = {
  info: { cls: 'bg-info-soft text-info-text', icon: <Info className="size-3.5" />, label: 'Info' },
  warning: { cls: 'bg-warning-soft text-warning-text', icon: <Clock className="size-3.5" />, label: 'Warning' },
  serious: { cls: 'bg-serious-soft text-serious-text', icon: <AlertTriangle className="size-3.5" />, label: 'Serious' },
  critical: { cls: 'bg-critical-soft text-critical-text', icon: <AlertOctagon className="size-3.5" />, label: 'Critical' },
};
export function SeverityBadge({ severity, label }: { severity: Severity; label?: string }) {
  const m = SEV[severity];
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', m.cls)}>{m.icon}{label ?? m.label}</span>;
}
export const severityIcon = (s: Severity) => SEV[s].icon;

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'Normal' || priority === 'Low') return <span className="text-xs text-ink-3">{priority}</span>;
  return <SeverityBadge severity={priority === 'Critical' ? 'critical' : 'serious'} label={priority} />;
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2', className)}>{children}</span>;
}

// ---------- tabs ----------
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ value: T; label: ReactNode; count?: number }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-print mb-5 max-w-full overflow-x-auto">
      <div className="inline-flex gap-2" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={clsx('eyebrow flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-4 py-2.5 transition-all',
            value === t.value ? 'btn-raised' : 'text-ink-3 hover:text-ink')}>
          {t.label}
          {t.count !== undefined && <span className={clsx('rounded-full px-1.5 text-[11px] tnum', value === t.value ? 'bg-white/15' : 'bg-surface-2 text-ink-2')}>{t.count}</span>}
        </button>
      ))}
      </div>
    </div>
  );
}

// ---------- modal ----------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={clsx('glass-pop max-h-[92vh] w-full overflow-auto rounded-t-[10px] sm:rounded-[10px]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[var(--popover)] px-6 pb-2 pt-5">
          <h3 className="text-sm">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2" aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="px-6 py-3">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 bg-[var(--popover)] px-6 pb-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

export function KeyVal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow text-[9.5px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children ?? '—'}</dd>
    </div>
  );
}

export function ScoreBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)} title={`${pct}% match`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full bg-sun" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tnum text-ink-2">{pct}%</span>
    </span>
  );
}
