import { Activity, AlertTriangle, Copy, EyeOff, Keyboard, Maximize, MousePointerClick, WifiOff } from 'lucide-react';
import { Badge } from '../ui/index.js';
import { fmtTime } from '../../lib/format.js';

export const EVENT_META = {
  TAB_HIDDEN: { icon: EyeOff, label: 'Left the tab' },
  WINDOW_BLUR: { icon: MousePointerClick, label: 'Window lost focus' },
  FULLSCREEN_EXIT: { icon: Maximize, label: 'Exited fullscreen' },
  DUPLICATE_TAB: { icon: Copy, label: 'Opened a second tab' },
  COPY: { icon: Copy, label: 'Tried to copy' },
  CUT: { icon: Copy, label: 'Tried to cut' },
  PASTE: { icon: Copy, label: 'Tried to paste' },
  CONTEXT_MENU: { icon: MousePointerClick, label: 'Right-clicked' },
  SHORTCUT: { icon: Keyboard, label: 'Blocked shortcut' },
  DEVTOOLS: { icon: AlertTriangle, label: 'Possible DevTools' },
  OFFLINE: { icon: WifiOff, label: 'Was offline' },
  NAVIGATION: { icon: AlertTriangle, label: 'Tried to leave' },
};
export const eventMeta = (type) => EVENT_META[type] || { icon: Activity, label: type };

export const SUBMIT_REASON = {
  PROCTORING_LIMIT: 'Auto-submitted',
  TEACHER: 'Force-submitted',
  TIMEOUT: 'Time ran out',
  ASSESSMENT_ENDED: 'Quiz ended',
  MANUAL: 'Submitted',
};

const SEVERITY_TONE = { CRITICAL: 'danger', WARNING: 'warn', INFO: 'neutral' };
const DOT = { CRITICAL: 'bg-danger ring-danger/20', WARNING: 'bg-warn ring-warn/20', INFO: 'bg-subtle ring-border' };

/** Vertical timeline of an attempt: start, proctoring events, submission. */
export function ProctorTimeline({ attempt }) {
  const events = attempt.events || attempt.proctoringEvents || [];
  return (
    <ol className="relative ml-2 space-y-4 border-l-2 border-dashed border-border pl-6">
      <li className="relative text-sm">
        <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-primary ring-4 ring-primary/20" />
        <span className="font-medium">Started</span> <span className="text-muted">{fmtTime(attempt.startedAt)}</span>
      </li>
      {events.map((e, i) => {
        const meta = eventMeta(e.type);
        return (
          <li key={i} className="relative text-sm">
            <span className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full ring-4 ${DOT[e.severity] || DOT.INFO}`} />
            <span className="font-medium">{meta.label}</span> <Badge tone={SEVERITY_TONE[e.severity]}>{e.severity === 'INFO' ? 'logged' : 'warning'}</Badge>
            <p className="mt-0.5 text-xs text-muted">
              {fmtTime(e.occurredAt)}
              {e.details ? ` · ${e.details}` : ''}
            </p>
          </li>
        );
      })}
      {attempt.submittedAt && (
        <li className="relative text-sm">
          <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-success ring-4 ring-success/20" />
          <span className="font-medium">{SUBMIT_REASON[attempt.submitReason] || 'Submitted'}</span> <span className="text-muted">{fmtTime(attempt.submittedAt)}</span>
        </li>
      )}
    </ol>
  );
}
