import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * Searchable checkbox list. options: [{ value, label, sub? }]
 * Replaces native multi-selects that require Ctrl/Cmd-click.
 */
export function MultiPicker({ options, value, onChange, placeholder = 'Search…', height = 'max-h-56', emptyText = 'Nothing to choose from.' }) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const toggle = (v) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.value));
  const toggleAll = () => {
    const ids = filtered.map((o) => o.value);
    onChange(allFilteredSelected ? value.filter((v) => !ids.includes(v)) : [...new Set([...value, ...ids])]);
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/50 px-3 py-2">
        <Search className="h-4 w-4 text-subtle" />
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="whitespace-nowrap text-xs text-muted">{value.length} selected</span>
      </div>
      {filtered.length > 1 && (
        <button type="button" onClick={toggleAll} className="w-full border-b border-border px-3 py-1.5 text-left text-xs font-semibold text-primary hover:bg-surface-2">
          {allFilteredSelected ? 'Clear' : 'Select'} {query ? 'matching' : 'all'} ({filtered.length})
        </button>
      )}
      <ul className={`${height} overflow-y-auto scrollbar-thin`}>
        {filtered.map((o) => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2/60">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.sub && <span className="truncate text-xs text-muted">{o.sub}</span>}
            </label>
          </li>
        ))}
        {!filtered.length && <li className="px-3 py-6 text-center text-sm text-muted">{options.length ? 'No matches.' : emptyText}</li>}
      </ul>
    </div>
  );
}
