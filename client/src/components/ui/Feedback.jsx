import { initials } from '../../lib/format.js';

const tones = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function Badge({ tone = 'neutral', dot = false, pulse = false, className = '', children }) {
  return (
    <span className={`badge ${tones[tone]} ${className}`}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

const stateTones = {
  DRAFT: ['neutral', 'Draft'],
  SCHEDULED: ['info', 'Scheduled'],
  AVAILABLE: ['success', 'Open'],
  LIVE: ['success', 'Live'],
  PAUSED: ['warn', 'Paused'],
  ENDED: ['neutral', 'Ended'],
  COMPLETED: ['neutral', 'Completed'],
  PUBLISHED: ['primary', 'Results out'],
  CANCELLED: ['danger', 'Cancelled'],
  IN_PROGRESS: ['info', 'In progress'],
  SUBMITTED: ['success', 'Submitted'],
  EVALUATED: ['primary', 'Evaluated'],
};

export function StatusBadge({ state }) {
  const [tone, label] = stateTones[state] || ['neutral', state];
  return (
    <Badge tone={tone} dot pulse={state === 'LIVE'}>
      {label}
    </Badge>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      {Icon && (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-subtle">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'primary', className = '' }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const bar = { primary: 'bg-primary', success: 'bg-success', warn: 'bg-warn', danger: 'bg-danger' }[tone];
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ${className}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full transition-all duration-300 ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'primary', loading }) {
  const iconTone = {
    primary: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success',
    warn: 'bg-warn-soft text-warn',
    info: 'bg-info-soft text-info',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  return (
    <div className="card flex items-start gap-4 p-5">
      {Icon && (
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-0.5 font-display text-2xl font-bold text-fg">{value ?? '—'}</p>}
        {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
      </div>
    </div>
  );
}

export function Avatar({ name, size = 'md' }) {
  const s = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm' }[size];
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary ${s}`} aria-hidden>
      {initials(name) || '?'}
    </span>
  );
}

export function Alert({ tone = 'info', icon: Icon, title, children, className = '' }) {
  const t = {
    info: 'border-info/30 bg-info-soft text-info',
    warn: 'border-warn/30 bg-warn-soft text-warn',
    danger: 'border-danger/30 bg-danger-soft text-danger',
    success: 'border-success/30 bg-success-soft text-success',
  }[tone];
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${t} ${className}`} role="status">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg/80">{children}</div>}
      </div>
    </div>
  );
}
