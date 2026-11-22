/**
 * Splits a heading so its last word can be set in the italic serif accent
 * ("Coding *practice*"), as in the reference. Only plain words of 3+ letters are accented.
 */
export function splitAccent(title) {
  if (typeof title !== 'string') return [title, null];
  const m = title.match(/^(.*\S)\s+([A-Za-z][A-Za-z'’-]{2,}[?!]?)$/);
  return m ? [m[1], m[2]] : [title, null];
}

export function PageHeader({ eyebrow, title, accent, description, actions, children }) {
  const [main, tail] = accent !== undefined ? [title, accent] : splitAccent(title);
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-fg/15 bg-surface px-3 py-1 text-xs font-semibold text-fg">
            <svg viewBox="0 0 100 100" className="h-3 w-3 fill-tile-green" aria-hidden>
              <path d="M44 4h12l-2 32 26-18 6 10-29 14 29 14-6 10-26-18 2 32H44l2-32-26 18-6-10 29-14L14 28l6-10 26 18z" />
            </svg>
            {eyebrow}
          </p>
        )}
        <h1 className="text-[1.9rem] font-bold leading-[1.1] tracking-tight text-fg sm:text-[2.35rem]">
          {main}
          {tail && (
            <>
              {' '}
              <span className="accent">{tail}</span>
            </>
          )}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Toolbar({ children, className = '' }) {
  return <div className={`flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 ${className}`}>{children}</div>;
}
