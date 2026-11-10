/** Segmented tab control. items: [{ value, label, count?, icon? }] */
export function Tabs({ items, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2/70 p-1 scrollbar-thin ${className}`}>
      {items.map(({ value: v, label, count, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {label}
            {count !== undefined && <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-primary-soft text-primary' : 'bg-border/60'}`}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
