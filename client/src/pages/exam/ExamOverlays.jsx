import { createPortal } from 'react-dom';
import { AlertOctagon, CheckCircle2, Copy, EyeOff, Maximize, MessageSquare, PauseCircle, ShieldAlert, ShieldX } from 'lucide-react';
import { Button } from '../../components/ui/index.js';
import { fmtDuration } from '../../lib/format.js';

/** Full-screen layer that cannot be clicked through. */
function Layer({ tone = 'danger', children }) {
  const glow = { danger: 'from-danger/25', warn: 'from-warn/25', info: 'from-primary/25', success: 'from-success/25' }[tone];
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md" role="alertdialog" aria-modal="true">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${glow} to-transparent`} />
      <div className="relative w-full max-w-lg animate-scale-in rounded-2xl border border-border bg-surface p-7 text-center shadow-pop">{children}</div>
    </div>,
    document.body,
  );
}

const violationCopy = {
  TAB_HIDDEN: { icon: EyeOff, title: 'You left the quiz tab', text: 'Switching tabs or minimising the browser is recorded.' },
  WINDOW_BLUR: { icon: EyeOff, title: 'The quiz window lost focus', text: 'Clicking into another window or app is recorded.' },
  FULLSCREEN_EXIT: { icon: Maximize, title: 'You exited fullscreen', text: 'This quiz must be taken in fullscreen.' },
  DUPLICATE_TAB: { icon: Copy, title: 'Quiz opened in another tab', text: 'Only one tab may be used for the quiz.' },
};

export function ViolationOverlay({ violation, policy, needsFullscreen, onContinue }) {
  const copy = violationCopy[violation.type] || violationCopy.WINDOW_BLUR;
  const Icon = copy.icon;
  const limit = policy.maxViolations;
  const count = violation.count;
  const remaining = limit > 0 && count != null ? Math.max(0, limit - count) : null;
  return (
    <Layer tone={remaining === 1 ? 'danger' : 'warn'}>
      <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${remaining === 1 ? 'animate-shake bg-danger-soft text-danger' : 'bg-warn-soft text-warn'}`}>
        <Icon className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-2xl font-extrabold">{copy.title}</h2>
      <p className="mt-2 text-muted">{copy.text} Your teacher can see this event.</p>
      {limit > 0 && (
        <div className="mt-5 rounded-xl border border-border bg-surface-2/50 p-4">
          <div className="flex justify-center gap-1.5" aria-hidden>
            {Array.from({ length: limit }, (_, i) => (
              <span key={i} className={`h-2.5 w-8 rounded-full ${count != null && i < count ? (i === limit - 1 ? 'bg-danger' : 'bg-warn') : 'bg-border'}`} />
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold">
            {count == null ? 'Recording…' : `Warning ${count} of ${limit}`}
            {remaining != null && remaining > 0 && <span className="font-normal text-muted"> · {remaining === 1 ? 'one more and your quiz is submitted automatically' : `${remaining} left before automatic submission`}</span>}
          </p>
        </div>
      )}
      <Button variant="primary" icon={needsFullscreen ? Maximize : undefined} className="mt-6 w-full py-3" onClick={onContinue} data-autofocus>
        {needsFullscreen ? 'Return to fullscreen and continue' : 'I understand, continue'}
      </Button>
    </Layer>
  );
}

export function PausedOverlay({ remainingSeconds }) {
  return (
    <Layer tone="info">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-primary">
        <PauseCircle className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-2xl font-extrabold">Quiz paused by your teacher</h2>
      <p className="mt-2 text-muted">Your timer is stopped and your answers are saved. Stay on this page; the quiz resumes automatically.</p>
      {remainingSeconds != null && <p className="mt-5 font-mono text-3xl font-bold tabular-nums">{fmtDuration(remainingSeconds)}</p>}
      <p className="text-xs text-subtle">time remaining</p>
    </Layer>
  );
}

export function MessageOverlay({ message, onClose }) {
  return (
    <Layer tone="info">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
        <MessageSquare className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-xl font-extrabold">Message from {message.from || 'your teacher'}</h2>
      <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2/60 p-4 text-left text-fg">{message.message}</p>
      <Button variant="primary" className="mt-6 w-full" onClick={onClose} data-autofocus>
        Got it
      </Button>
    </Layer>
  );
}

export function DuplicateTabOverlay() {
  return (
    <Layer>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-danger-soft text-danger">
        <ShieldX className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-2xl font-extrabold">This quiz is already open</h2>
      <p className="mt-2 text-muted">Continue in the tab where you started. This event has been recorded. You can close this tab.</p>
    </Layer>
  );
}

const finishCopy = {
  MANUAL: { icon: CheckCircle2, tone: 'success', title: 'Quiz submitted', text: 'Your answers have been submitted successfully.' },
  TIMEOUT: { icon: CheckCircle2, tone: 'success', title: "Time's up", text: 'Your answers were submitted automatically when the timer ended.' },
  ASSESSMENT_ENDED: { icon: CheckCircle2, tone: 'success', title: 'The quiz has ended', text: 'Your teacher ended the quiz. Your saved answers were submitted.' },
  PROCTORING_LIMIT: { icon: ShieldAlert, tone: 'danger', title: 'Quiz submitted automatically', text: 'You reached the warning limit for leaving the quiz. Your saved answers were submitted.' },
  TEACHER: { icon: AlertOctagon, tone: 'warn', title: 'Submitted by your teacher', text: 'Your teacher submitted your attempt. Your saved answers were submitted.' },
};

export function FinishedScreen({ reason, title, submittedAt, message, onDone }) {
  const copy = finishCopy[reason] || finishCopy.MANUAL;
  const Icon = copy.icon;
  const tone = { success: 'bg-success-soft text-success', danger: 'bg-danger-soft text-danger', warn: 'bg-warn-soft text-warn' }[copy.tone];
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-lg animate-scale-in rounded-2xl border border-border bg-surface p-8 text-center shadow-pop">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${tone}`}>
          <Icon className="h-8 w-8" />
        </div>
        <p className="mt-5 text-sm font-semibold text-muted">{title}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{copy.title}</h1>
        <p className="mt-2 text-muted">{copy.text}</p>
        {message && <p className="mt-3 rounded-lg bg-surface-2/60 p-3 text-sm">“{message}”</p>}
        {submittedAt && <p className="mt-4 text-xs text-subtle">Submitted {new Date(submittedAt).toLocaleString()}</p>}
        <p className="mt-4 text-sm text-muted">Results appear under My grades once your teacher publishes them.</p>
        <Button variant="primary" className="mt-7 w-full" onClick={onDone}>
          Back to assessments
        </Button>
      </div>
    </div>
  );
}
