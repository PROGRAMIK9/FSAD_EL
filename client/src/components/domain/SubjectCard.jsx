import { GraduationCap, Users } from 'lucide-react';
import { Badge, Button } from '../ui/index.js';

const accents = ['from-sky-500 to-blue-600', 'from-emerald-500 to-teal-600', 'from-violet-500 to-indigo-600', 'from-amber-500 to-orange-600', 'from-rose-500 to-pink-600'];
const accentFor = (code = '') => accents[[...code].reduce((n, c) => n + c.charCodeAt(0), 0) % accents.length];

export function SubjectCard({ subject: s, onAllocate }) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${accentFor(s.code)}`} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="primary" className="font-mono">
            {s.code}
          </Badge>
          <span className="text-xs text-subtle">Sem {s.semester}</span>
        </div>
        <h3 className="mt-3 line-clamp-2 text-base font-bold text-fg">{s.name}</h3>
        <p className="mt-1 truncate text-sm text-muted">{s.department?.name || 'Department'}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>{s.credits || 0} credits</span>
          <span className="inline-flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5" /> {s.teachers?.length || 0} faculty
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {s.students?.length || 0} students
          </span>
        </div>
        {s.teachers?.length > 0 && <p className="mt-2 truncate text-xs text-subtle">{s.teachers.map((t) => t.name).join(', ')}</p>}
        {onAllocate && (
          <Button size="sm" className="mt-4 w-full" onClick={onAllocate}>
            Manage allocations
          </Button>
        )}
      </div>
    </div>
  );
}
