import { ArrowUpRight } from 'lucide-react';

/**
 * RV College of Engineering crest (monochrome). `color="auto"` follows the theme (black on
 * light, white on dark); `black` or `white` pin it, e.g. black on a pastel tile.
 */
export function Crest({ className = 'h-10 w-10', color = 'auto' }) {
  const black = { auto: 'dark:hidden', black: '', white: 'hidden' }[color];
  const white = { auto: 'hidden dark:block', black: 'hidden', white: '' }[color];
  return (
    <span className={`relative inline-block shrink-0 ${className}`} aria-hidden>
      <img src="/brand/rv-crest.png" alt="" className={`h-full w-full object-contain ${black}`} />
      <img src="/brand/rv-crest-white.png" alt="" className={`h-full w-full object-contain ${white}`} />
    </span>
  );
}

/** Crest + "RV College of Engineering / Academic Hub". */
export function Logo({ compact = false, className = '' }) {
  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      <Crest className="h-10 w-10" />
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block text-[12.5px] font-bold leading-tight tracking-tight text-fg">RV College of Engineering</span>
          <span className="block truncate font-accent text-[15px] italic text-muted">Academic Hub</span>
        </span>
      )}
      <span className="sr-only">RV College of Engineering Academic Hub</span>
    </span>
  );
}

/** Italic serif accent words inside a heading. */
export const Accent = ({ children, className = '' }) => <span className={`accent ${className}`}>{children}</span>;

const SHAPES = {
  asterisk: (
    <path d="M44 4h12l-2 32 26-18 6 10-29 14 29 14-6 10-26-18 2 32H44l2-32-26 18-6-10 29-14L14 28l6-10 26 18z" />
  ),
  flower: (
    <path d="M50 6c8 0 13 9 13 18 7-6 18-7 23 0s1 17-6 22c8 2 15 10 12 18s-14 10-21 6c1 9-5 18-14 18s-15-9-14-18c-7 4-18 2-21-6s4-16 12-18c-7-5-11-15-6-22s16-6 23 0c0-9 5-18 13-18z" />
  ),
  heart: <path d="M50 88C20 66 6 50 6 32 6 18 17 8 30 8c9 0 16 5 20 12 4-7 11-12 20-12 13 0 24 10 24 24 0 18-14 34-44 56z" />,
  blob: <path d="M70 10c16 8 26 26 22 44S72 92 52 94 10 84 7 62 22 18 40 9s14-7 30 1z" />,
  star: <path d="M50 4l10 32 34 1-27 20 10 33-27-20-27 20 10-33L6 37l34-1z" />,
};

/** Decorative organic shape (reference flowers, asterisks, hearts). Purely visual. */
export function Shape({ shape = 'flower', className = 'h-12 w-12 text-tile-yellow', style }) {
  return (
    <svg viewBox="0 0 100 100" className={`pointer-events-none shrink-0 fill-current ${className}`} style={style} aria-hidden focusable="false">
      {SHAPES[shape]}
    </svg>
  );
}

/** Thin looping line used behind hero content. */
export function Squiggle({ className = 'h-24 w-full text-primary/30' }) {
  return (
    <svg viewBox="0 0 400 120" preserveAspectRatio="none" className={`pointer-events-none ${className}`} aria-hidden focusable="false">
      <path d="M-5 90C55 20 105 130 165 70s75-70 50-30 60 95 120 40 50-40 70-20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const TAG_TONES = { green: 'bg-tile-green', lavender: 'bg-tile-lavender', lime: 'bg-tile-lime', pink: 'bg-tile-pink', yellow: 'bg-tile-yellow' };

/** "#Drawing" style hashtag pill. */
export function TagPill({ children, tone = 'pink', rotate = 0, className = '' }) {
  return (
    <span className={`tag-pill ${TAG_TONES[tone]} ${className}`} style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}>
      {children}
    </span>
  );
}

export const TILE_TONES = ['green', 'lavender', 'lime', 'pink', 'yellow'];

/**
 * Pastel tile with an optional corner chip, a two-part title (sans + italic serif) and the round
 * ↗ button. Renders as a link when `to`/`href` is given through `as`.
 */
export function Tile({ tone = 'lavender', chip, title, accent, children, arrow = false, shape, className = '', as: As = 'div', ...props }) {
  return (
    <As className={`tile tile-${tone} flex flex-col ${className}`} {...props}>
      {shape && <Shape shape={shape} className="absolute -bottom-6 -right-4 -z-10 h-24 w-24 text-white/45" />}
      {chip && <span className="tile-chip self-start">{chip}</span>}
      {(title || accent) && (
        <p className="mt-3 text-lg font-bold leading-tight">
          {title}
          {accent && <span className="accent block text-xl">{accent}</span>}
        </p>
      )}
      {children}
      {arrow && (
        <span className="tile-arrow mt-auto self-end" aria-hidden>
          <ArrowUpRight className="h-4 w-4" />
        </span>
      )}
    </As>
  );
}

/** Circular text badge that slowly rotates ("RV COLLEGE · ACADEMIC HUB ·"). */
export function CircleBadge({ text = 'RV COLLEGE · ACADEMIC HUB · ', className = 'h-28 w-28', children }) {
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full bg-tile-lavender text-tile-ink ${className}`} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full motion-safe:animate-[spin_18s_linear_infinite]">
        <defs>
          <path id="circle-badge-path" d="M50 50m-38 0a38 38 0 1 1 76 0a38 38 0 1 1-76 0" />
        </defs>
        <text fontSize="9.5" fontWeight="700" letterSpacing="2.2" fill="currentColor">
          <textPath href="#circle-badge-path">{text}</textPath>
        </text>
      </svg>
      {children}
    </span>
  );
}
