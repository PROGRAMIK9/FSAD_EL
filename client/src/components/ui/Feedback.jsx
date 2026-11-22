import { initials } from '../../lib/format.js';

const tones = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary-strong',
  ink: 'bg-ink text-ink-fg',
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
        <div className="relative mb-4 grid h-16 w-16 place-items-center rounded-full bg-tile-lavender text-tile-ink">
          <Icon className="h-6 w-6" />
          <svg viewBox="0 0 100 100" className="absolute -right-2 -top-1 h-6 w-6 fill-tile-green" aria-hidden>
            <path d="M44 4h12l-2 32 26-18 6 10-29 14 29 14-6 10-26-18 2 32H44l2-32-26 18-6-10 29-14L14 28l6-10 26 18z" />
          </svg>
        </div>
      )}
      <p className="font-display font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'primary', size = 'md', className = '' }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const bar = { primary: 'bg-primary', success: 'bg-success', warn: 'bg-warn', danger: 'bg-danger', white: 'bg-white' }[tone];
  const h = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' }[size];
  return (
    <div className={`${h} w-full overflow-hidden rounded-full ${tone === 'white' ? 'bg-white/25' : 'bg-surface-2'} ${className}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full transition-all duration-300 ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Stat tiles use the pastel palette; the tone picks the tile colour. */
const tileTones = {
  primary: 'tile-lavender',
  success: 'tile-green',
  warn: 'tile-yellow',
  info: 'tile-lime',
  danger: 'tile-pink',
};

/** Metric tile. `variant="hero"` renders the saturated brand card (QuizBox wallet). */
export function StatCard({ label, value, hint, icon: Icon, tone = 'primary', loading, variant, className = '' }) {
  if (variant === 'hero')
    return (
      <div className={`card-hero p-5 ${className}`}>
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/20">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <p className="font-display text-xs font-semibold uppercase tracking-wider text-white/90">{label}</p>
        </div>
        {loading ? <Skeleton className="mt-3 h-10 w-20 bg-white/20" /> : <p className="mt-3 font-display text-4xl font-bold tabular">{value ?? '—'}</p>}
        {hint && <p className="mt-1 text-sm text-white/85">{hint}</p>}
      </div>
    );
  return (
    <div className={`tile ${tileTones[tone] || 'tile-lavender'} flex min-h-[8.5rem] flex-col justify-between gap-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-tile-ink/70">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div>
        {loading ? <Skeleton className="h-9 w-16 bg-white/50" /> : <p className="text-[2rem] font-bold leading-none tracking-tight tabular">{value ?? '—'}</p>}
        {hint && <p className="mt-1.5 text-xs font-medium text-tile-ink/70">{hint}</p>}
      </div>
    </div>
  );
}

/** Section heading with a small asterisk mark. */
export function SectionTitle({ children, action, className = '' }) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-3 ${className}`}>
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-fg">
        <svg viewBox="0 0 100 100" className="h-4 w-4 fill-tile-green" aria-hidden>
          <path d="M44 4h12l-2 32 26-18 6 10-29 14 29 14-6 10-26-18 2 32H44l2-32-26 18-6-10 29-14L14 28l6-10 26 18z" />
        </svg>
        {children}
      </h2>
      {action}
    </div>
  );
}

/** "25 Questions" style metadata: a round number badge followed by a label. */
export function MetaPill({ value, label, onHero = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${onHero ? 'text-white/95' : 'text-muted'}`}>
      <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 font-display text-[10.5px] font-bold tabular ${onHero ? 'bg-white text-[#0b1220]' : 'bg-surface-2 text-fg'}`}>{value}</span>
      {label}
    </span>
  );
}

const AVATAR_HUES = ['bg-primary-soft text-primary-strong', 'bg-info-soft text-info', 'bg-success-soft text-success', 'bg-warn-soft text-warn'];
const hueOf = (name = '') => AVATAR_HUES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_HUES.length];

export function Avatar({ name, size = 'md', ring = false, className = '' }) {
  const s = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm', xl: 'h-16 w-16 text-lg' }[size];
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-display font-bold ${hueOf(name)} ${ring ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''} ${s} ${className}`} aria-hidden>
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
    <div className={`flex gap-3 rounded-2xl border px-4 py-3 text-sm ${t} ${className}`} role="status">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg/80">{children}</div>}
      </div>
    </div>
  );
}
