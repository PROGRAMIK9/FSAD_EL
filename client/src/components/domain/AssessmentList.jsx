import { Link } from 'react-router-dom';
import { CalendarClock, ClipboardList } from 'lucide-react';
import { EmptyState, StatusBadge } from '../ui/index.js';
import { fmtTime } from '../../lib/format.js';

export function AssessmentList({ items, empty = 'No assessments yet.' }) {
  if (!items.length) return <EmptyState icon={ClipboardList} title={empty} className="py-8" />;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        const d = a.startsAt ? new Date(a.startsAt) : null;
        return (
          <li key={a._id}>
            <Link to="/assessments" className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2/60">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary-soft text-center leading-none text-primary">
                {d ? (
                  <div>
                    <p className="font-display text-lg font-bold">{d.getDate()}</p>
                    <p className="text-[10px] font-semibold uppercase">{d.toLocaleString(undefined, { month: 'short' })}</p>
                  </div>
                ) : (
                  <CalendarClock className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">{a.title}</p>
                <p className="truncate text-xs text-muted">
                  {a.subject?.code || 'Quiz'} · {a.durationMinutes} min{d ? ` · ${fmtTime(d)}` : ''}
                </p>
              </div>
              <StatusBadge state={a.state} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
