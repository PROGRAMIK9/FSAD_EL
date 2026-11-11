/** Circular progress. `value`/`max` fill the ring clockwise from 12 o'clock. */
export function Ring({ value, max = 100, size = 64, stroke = 6, color = 'rgb(var(--c-primary))', track = 'rgb(var(--c-surface-2))', className = '', children, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / (max || 1)));
  return (
    <div className={`relative inline-grid shrink-0 place-items-center ${className}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1), stroke .3s' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

const two = (n) => String(n).padStart(2, '0');
export const clockText = (secs) => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  return h ? `${h}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
};

/** Countdown ring: brand blue, amber under 5 min (or 20%), red under 1 min (or 10%). */
export function TimerRing({ remaining, total, size = 72, paused = false, onDark = false }) {
  const pct = total ? remaining / total : 1;
  const tone = remaining <= 60 || pct <= 0.1 ? 'danger' : remaining <= 300 || pct <= 0.2 ? 'warn' : 'primary';
  const color = paused ? 'rgb(var(--c-subtle))' : `rgb(var(--c-${tone}))`;
  return (
    <Ring
      value={remaining}
      max={total || remaining || 1}
      size={size}
      stroke={size > 60 ? 6 : 4}
      color={onDark ? (tone === 'primary' && !paused ? '#fff' : color) : color}
      track={onDark ? 'rgb(255 255 255 / .22)' : undefined}
      label={paused ? 'Timer paused' : `${clockText(remaining)} remaining`}
    >
      <span className={`text-center font-display font-bold leading-none tabular ${size > 60 ? 'text-[15px]' : 'text-[11px]'} ${tone === 'danger' && !paused ? 'animate-pulse' : ''}`}>
        {paused ? 'II' : clockText(remaining)}
      </span>
    </Ring>
  );
}

/** Score ring for results: green ≥ 70%, blue ≥ 40%, amber below. */
export function ScoreRing({ score, max = 10, size = 96, onDark = false }) {
  const pct = max ? score / max : 0;
  const color = onDark ? '#fff' : pct >= 0.7 ? 'rgb(var(--c-success))' : pct >= 0.4 ? 'rgb(var(--c-primary))' : 'rgb(var(--c-warn))';
  return (
    <Ring value={score ?? 0} max={max} size={size} stroke={size > 80 ? 9 : 6} color={color} track={onDark ? 'rgb(255 255 255 / .22)' : undefined} label={`Score ${score} out of ${max}`}>
      <span className="text-center leading-none">
        <span className={`block font-display font-bold tabular ${size > 80 ? 'text-2xl' : size >= 64 ? 'text-lg' : 'text-sm'}`}>{score ?? '—'}</span>
        {size >= 64 && <span className={`block text-[10px] font-semibold uppercase tracking-wider ${onDark ? 'text-white/75' : 'text-muted'}`}>of {max}</span>}
      </span>
    </Ring>
  );
}
