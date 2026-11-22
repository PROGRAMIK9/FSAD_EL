/** Segmented pill control. items: [{ value, label, count?, icon? }] */
export function Tabs({ items, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={`inline-flex max-w-full gap-1.5 overflow-x-auto p-0.5 scrollbar-thin ${className}`}>
      {items.map(({ value: v, label, count, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
              active ? 'border-ink bg-ink text-ink-fg' : 'border-fg/15 bg-surface text-muted hover:border-fg/40 hover:text-fg'
            }`}
          >
            {Icon && <Icon className={`h-4 w-4 ${active ? 'text-tile-green' : ''}`} />}
            {label}
            {count !== undefined && (
              <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular ${active ? 'bg-tile-lime text-tile-ink' : 'bg-surface-2 text-muted'}`}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
