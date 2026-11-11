import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CalendarClock, CheckCircle2, DoorOpen, Lock, Play, RotateCcw, ShieldCheck, Trophy } from 'lucide-react';
import { api } from '../../lib/api.js';
import { Button, MetaPill, StatusBadge, useConfirm } from '../ui/index.js';
import { fmtDateTime } from '../../lib/format.js';

const HUES = ['hero-sky', 'hero-indigo', 'hero-teal', 'hero-ocean'];
/** Stable gradient hue per subject so a subject always looks the same. */
export const hueFor = (code = '') => HUES[[...code].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];

const ROOM_JOINABLE = ['SCHEDULED', 'AVAILABLE', 'LIVE', 'PAUSED'];
const SUBMIT_TEXT = {
  PROCTORING_LIMIT: 'Auto-submitted (proctoring)',
  TEACHER: 'Submitted by teacher',
  TIMEOUT: 'Submitted at time-up',
  ASSESSMENT_ENDED: 'Submitted when quiz ended',
};

/** What a student can do with a quiz right now. */
export function studentActionFor(a) {
  const mine = a.myAttempts || {};
  const left = (a.attemptsAllowed || 1) - (mine.count || 0);
  if (mine.activeId) return { kind: 'resume', label: 'Resume', icon: RotateCcw, to: `/exam/${a._id}?resume=1` };
  if (a.availabilityMode === 'room' && ROOM_JOINABLE.includes(a.state) && left > 0) return { kind: 'join', label: 'Join room', icon: DoorOpen };
  if (['AVAILABLE', 'LIVE'].includes(a.state) && left > 0) return { kind: 'start', label: mine.count ? 'Retake' : 'Start', icon: Play, to: `/exam/${a._id}` };
  if (a.myResult) return { kind: 'result', label: 'View result', icon: Trophy, to: `/results/${a._id}` };
  if (mine.count) return { kind: 'submitted', label: SUBMIT_TEXT[mine.lastSubmitReason] || 'Submitted', icon: CheckCircle2 };
  if (a.state === 'SCHEDULED') return { kind: 'locked', label: a.startsAt ? `Opens ${fmtDateTime(a.startsAt)}` : 'Not open yet', icon: Lock };
  return null;
}

/** Renders the student's action; `corner` tucks a black CTA into a hero card's corner. */
export function StudentQuizAction({ a, corner = false }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const action = studentActionFor(a);
  if (!action) return null;
  if (action.kind === 'locked' && !corner) return null;
  if (action.kind === 'submitted' || action.kind === 'locked') {
    const Icon = action.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${corner ? 'absolute bottom-4 right-5 text-white/90' : action.kind === 'submitted' ? 'text-success' : 'text-muted'}`}>
        <Icon className="h-4 w-4" /> {action.label}
      </span>
    );
  }
  const join = async () => {
    const code = await confirm({ title: 'Join exam room', body: 'Enter the room code your teacher shared.', confirmLabel: 'Join', input: { placeholder: 'RVCE-QUIZ-XXXXXX', minLength: 8 } });
    if (!code) return;
    try {
      const room = await api.post('/rooms/join', { code: code.toUpperCase() });
      navigate(`/rooms/${room._id}`);
    } catch (e) {
      toast.error(String(e));
    }
  };
  const props = { icon: action.kind === 'result' ? undefined : action.icon, to: action.to, onClick: action.kind === 'join' ? join : undefined };
  if (corner)
    return (
      <Button variant="ink" className="cta-corner" {...props}>
        {action.label}
        {action.kind === 'result' && <ArrowRight />}
      </Button>
    );
  return (
    <Button size="sm" variant={action.kind === 'result' ? 'secondary' : 'primary'} {...props}>
      {action.label}
    </Button>
  );
}

function Chips({ a, onHero }) {
  const base = onHero ? 'chip chip-glass' : 'chip';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={onHero ? 'chip chip-light' : 'chip bg-ink text-ink-fg'}>{a.subject?.code || 'Quiz'}</span>
      {a.proctoring?.enabled !== false && (
        <span className={base}>
          <ShieldCheck /> Proctored
        </span>
      )}
      {a.availabilityMode === 'room' && (
        <span className={base}>
          <DoorOpen /> Live room
        </span>
      )}
      {a.state === 'LIVE' && (
        <span className={onHero ? 'chip bg-success text-white' : 'chip bg-success-soft text-success'}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Live
        </span>
      )}
    </div>
  );
}

function when(a) {
  if (a.state === 'SCHEDULED' && a.startsAt) return `Opens ${fmtDateTime(a.startsAt)}`;
  if (a.endsAt && ['AVAILABLE', 'LIVE', 'PAUSED'].includes(a.state)) return `Closes ${fmtDateTime(a.endsAt)}`;
  return null;
}

/**
 * Student quiz tile. `hero` is the saturated QuizBox card used for quizzes that
 * are open now; the default is a calm white card for everything else.
 */
export function QuizCard({ a, hero = false, className = '', style }) {
  const meta = [
    [a.questionCount || '—', 'Questions'],
    [a.maxMarks || 10, 'Marks'],
    [a.durationMinutes, 'Min'],
  ];
  const time = when(a);
  if (hero)
    return (
      <article className={`card-hero ${hueFor(a.subject?.code)} flex min-h-[208px] flex-col p-5 pb-16 ${className}`} style={style}>
        <Chips a={a} onHero />
        <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-snug">{a.title}</h3>
        <p className="mt-0.5 truncate text-sm text-white/85">{a.subject?.name}</p>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 pt-4">
          {meta.map(([v, l]) => (
            <MetaPill key={l} value={v} label={l} onHero />
          ))}
        </div>
        {time && (
          <p className="absolute bottom-4 left-5 flex items-center gap-1.5 text-xs font-medium text-white/85">
            <CalendarClock className="h-3.5 w-3.5" /> {time}
          </p>
        )}
        <StudentQuizAction a={a} corner />
      </article>
    );

  return (
    <article className={`card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift ${className}`} style={style}>
      <div className="flex items-start justify-between gap-3">
        <Chips a={a} />
        <StatusBadge state={a.state} />
      </div>
      <h3 className="mt-3 line-clamp-2 font-display text-base font-semibold leading-snug text-fg">{a.title}</h3>
      <p className="mt-0.5 truncate text-sm text-muted">{a.subject?.name}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {meta.map(([v, l]) => (
          <MetaPill key={l} value={v} label={l} />
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
        {a.myResult ? (
          <p className="font-display text-sm font-semibold text-fg">
            <span className="text-xl font-bold text-primary-strong">{a.myResult.rawMarks}</span>
            <span className="text-muted">/{a.myResult.maxMarks}</span>
          </p>
        ) : (
          <p className="truncate text-xs text-muted">{time || (a.attemptsAllowed > 1 ? `${a.attemptsAllowed} attempts allowed` : 'One attempt')}</p>
        )}
        <StudentQuizAction a={a} />
      </div>
    </article>
  );
}
