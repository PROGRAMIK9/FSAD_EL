/** Segmented pill control. items: [{ value, label, count?, icon? }] */
export function Tabs({ items, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 scrollbar-thin ${className}`}>
      {items.map(({ value: v, label, count, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
            }`}
          >
            {Icon && <Icon className={`h-4 w-4 ${active ? 'text-primary' : ''}`} />}
            {label}
            {count !== undefined && (
              <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular ${active ? 'bg-primary text-white' : 'bg-border/70 text-muted'}`}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
