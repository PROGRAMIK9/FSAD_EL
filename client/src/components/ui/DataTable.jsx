import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Inbox } from 'lucide-react';
import { EmptyState, Skeleton } from './Feedback.jsx';

/**
 * columns: [{ key, label, render?(row), sortValue?(row), sortable?, className?, align? }]
 * Sorting is client-side and only on columns marked `sortable`.
 */
export function DataTable({ columns, rows = [], loading, empty = 'No records found.', emptyIcon = Inbox, onRowClick, rowKey = (r, i) => r._id || r.id || i, className = '' }) {
  const [sort, setSort] = useState(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get = col?.sortValue || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const [x, y] = [get(a), get(b)];
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggle = (key) => setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  return (
    <div className={`overflow-x-auto scrollbar-thin ${className}`}>
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key || c.label} className={`${c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`}>
                {c.sortable ? (
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-fg">
                    {c.label}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows.length
            ? Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key || c.label}>
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((row, i) => (
                <tr key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'cursor-pointer' : ''}>
                  {columns.map((c) => (
                    <td key={c.key || c.label} className={`${c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`}>
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && !rows.length && <EmptyState icon={emptyIcon} title={empty} />}
    </div>
  );
}
