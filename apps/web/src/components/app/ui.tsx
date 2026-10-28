import { CheckCircle2, CircleDashed, Loader2, PauseCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { RunStatus } from '@/lib/api';

export const SERIES = { baseline: '#8B7CF6', variant: '#2AA88F', third: '#D46F42' } as const;

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm text-lavender-soft">{eyebrow}</p>}
        <h1 className="mt-1 text-[1.7rem] font-medium tracking-tight text-white md:text-3xl">{title}</h1>
        {description && <div className="mt-2 max-w-[70ch] text-sand/65">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, padded = true }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn('rounded-2xl border border-line-dark bg-midnight/70', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line-dark px-5 py-3.5">
          <h2 className="text-[0.95rem] font-medium text-white">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad' | 'muted' }) {
  return (
    <div className="rounded-2xl border border-line-dark bg-midnight/70 px-5 py-4">
      <p className="text-[0.8rem] text-sand/60">{label}</p>
      <p className="mt-1.5 text-2xl font-medium tabular-nums text-white">{value}</p>
      {sub && <p className={cn('mt-1 text-xs', tone === 'good' ? 'text-mint' : tone === 'bad' ? 'text-peach' : 'text-sand/55')}>{sub}</p>}
    </div>
  );
}

const STATUS: Record<RunStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  queued: { label: 'Queued', cls: 'text-sand/70 border-line-dark', Icon: CircleDashed },
  running: { label: 'Running', cls: 'text-lavender-soft border-lavender/40', Icon: Loader2 },
  paused: { label: 'Paused', cls: 'text-peach border-peach/40', Icon: PauseCircle },
  completed: { label: 'Completed', cls: 'text-mint border-mint/40', Icon: CheckCircle2 },
  failed: { label: 'Failed', cls: 'text-danger border-danger/40', Icon: XCircle },
  cancelled: { label: 'Cancelled', cls: 'text-sand/55 border-line-dark', Icon: XCircle },
};
export function StatusBadge({ status }: { status: RunStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs', s.cls)}>
      <s.Icon size={13} className={status === 'running' ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-dark px-6 py-12 text-center">
      <p className="font-medium text-white">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-[52ch] text-sm text-sand/60">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-white/[0.05] motion-reduce:animate-none', className)} />;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {children}
    </p>
  );
}

export const btn = {
  primary: 'inline-flex items-center gap-2 rounded-full bg-lavender px-4 py-2 text-sm font-medium text-white transition hover:bg-[#9a8cff] disabled:opacity-50',
  ghost: 'inline-flex items-center gap-2 rounded-full border border-line-dark px-4 py-2 text-sm text-sand transition hover:bg-white/5 disabled:opacity-50',
  danger: 'inline-flex items-center gap-2 rounded-full border border-danger/40 px-4 py-2 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-50',
};

export const fmt = {
  s: (v: number | null | undefined) => (v == null ? '—' : v >= 120 ? `${(v / 60).toFixed(1)} min` : `${v.toFixed(0)} s`),
  n: (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('en-US')),
  pct: (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)} %`),
  kmh: (ms: number | null | undefined) => (ms == null ? '—' : `${(ms * 3.6).toFixed(1)} km/h`),
  clock: (startHour: number, s: number) => {
    const m = startHour * 60 + Math.floor(s / 60);
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  },
  ago: (iso: string) => {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return 'just now';
    if (d < 3600) return `${Math.floor(d / 60)} min ago`;
    if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  },
};
