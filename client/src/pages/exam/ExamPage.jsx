import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  CloudOff,
  Grid3x3,
  Loader2,
  Maximize,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { getSocket } from '../../lib/socket.js';
import { fmtDuration, fmtRelative } from '../../lib/format.js';
import { useApi } from '../../hooks/useApi.js';
import { useServerClock } from '../../hooks/useServerClock.js';
import { useSocketEvent } from '../../hooks/useSocketEvent.js';
import { FOCUS_EVENTS, enterFullscreen, exitFullscreen, useProctoring } from '../../hooks/useProctoring.js';
import { Alert, Badge, Button, Checkbox, Modal, Spinner } from '../../components/ui/index.js';
import { DuplicateTabOverlay, FinishedScreen, MessageOverlay, PausedOverlay, ViolationOverlay } from './ExamOverlays.jsx';
import { clearBackup, useAnswers } from './useAnswers.js';

const isAnswered = (a) => a && a.value !== undefined && a.value !== null && String(a.value).trim() !== '';

function Gate({ info, resuming, busy, onBegin, onBack }) {
  const [agreed, setAgreed] = useState(false);
  const p = info.proctoring || {};
  const canFullscreen = document.fullscreenEnabled;
  const notOpenYet = !resuming && info.availabilityMode !== 'room' && (info.state === 'SCHEDULED' || (info.startsAt && new Date(info.startsAt) > new Date()));
  const closed = !resuming && ['ENDED', 'COMPLETED', 'PUBLISHED', 'CANCELLED'].includes(info.state);
  const rules = [
    `${info.durationMinutes} minutes once you start. The timer keeps running if you leave, and the quiz submits itself when time is up.`,
    'Answers save automatically as you go. If you lose connection, keep working; they are kept on this device and sent when you reconnect.',
  ];
  if (p.enabled) {
    if (p.requireFullscreen) rules.push('The quiz runs in fullscreen. Leaving fullscreen counts as a warning.');
    rules.push('Switching tabs, minimising the browser or clicking into another window counts as a warning.');
    if (p.detectDuplicateTab) rules.push('Opening the quiz in a second tab or window counts as a warning.');
    if (p.blockClipboard) rules.push('Copy, cut and paste are disabled.');
    if (p.blockContextMenu) rules.push('Right-click, printing and browser developer shortcuts are disabled.');
    if (p.maxViolations > 0) rules.push(`At warning ${p.maxViolations} your quiz is submitted automatically with the answers saved so far.`);
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-2xl animate-scale-in rounded-2xl border border-border bg-surface shadow-pop">
        <div className="border-b border-border p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {info.subject?.code} · Quiz · {info.maxMarks || 10} marks
          </p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{info.title}</h1>
          {info.description && <p className="mt-3 whitespace-pre-wrap text-muted">{info.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="primary">
              <Clock className="h-3.5 w-3.5" /> {info.durationMinutes} min
            </Badge>
            {p.enabled && (
              <Badge tone="warn">
                <ShieldCheck className="h-3.5 w-3.5" /> Proctored
              </Badge>
            )}
            {resuming && <Badge tone="info">Resuming your attempt</Badge>}
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <h2 className="text-base font-bold">Before you begin</h2>
          <ul className="mt-3 space-y-2.5">
            {rules.map((r) => (
              <li key={r} className="flex gap-3 text-sm text-muted">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {r}
              </li>
            ))}
          </ul>
          {p.enabled && <p className="mt-4 text-xs text-subtle">Only browser activity is monitored. Your camera, microphone and screen are never accessed.</p>}
          {p.enabled && p.requireFullscreen && !canFullscreen && (
            <Alert tone="warn" icon={AlertTriangle} className="mt-4" title="Fullscreen isn't available in this browser">
              You can continue, but use a desktop browser if you can.
            </Alert>
          )}
          {notOpenYet && (
            <Alert tone="info" icon={Clock} className="mt-4" title="This quiz hasn't opened yet">
              {info.startsAt ? `It opens ${new Date(info.startsAt).toLocaleString()}.` : 'Your teacher will open it soon.'}
            </Alert>
          )}
          {closed && (
            <Alert tone="warn" icon={AlertTriangle} className="mt-4" title="This quiz is closed">
              It can no longer be attempted.
            </Alert>
          )}
          <Checkbox className="mt-6" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} label="I have read the rules and I'm ready to start." />
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onBack}>Not now</Button>
            <Button variant="primary" icon={p.enabled && p.requireFullscreen && canFullscreen ? Maximize : undefined} disabled={!agreed || closed || notOpenYet} loading={busy} onClick={onBegin} className="py-2.5">
              {resuming ? 'Resume quiz' : 'Start quiz'}
              {p.enabled && p.requireFullscreen && canFullscreen ? ' in fullscreen' : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Timer({ seconds, paused }) {
  const tone = paused ? 'bg-surface-2 text-muted' : seconds <= 60 ? 'bg-danger text-white animate-pulse' : seconds <= 300 ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-fg';
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${tone}`} role="timer" aria-live={seconds <= 60 ? 'assertive' : 'off'}>
      <Clock className="h-4 w-4" />
      {fmtDuration(seconds)}
      {paused && <span className="font-sans text-xs font-semibold">paused</span>}
    </div>
  );
}

function SaveStatus({ status, lastSavedAt }) {
  if (status === 'offline')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warn">
        <CloudOff className="h-3.5 w-3.5" /> Offline: answers kept on this device
      </span>
    );
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger">
        <AlertTriangle className="h-3.5 w-3.5" /> Not saved, retrying…
      </span>
    );
  if (status === 'saving')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  if (lastSavedAt)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={lastSavedAt.toLocaleTimeString()}>
        <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Saved {fmtRelative(lastSavedAt)}
      </span>
    );
  return null;
}

function Palette({ questions, answers, current, onJump }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((q, i) => {
          const a = answers[q._id];
          const answered = isAnswered(a);
          return (
            <button
              key={q._id}
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Question ${i + 1}${answered ? ', answered' : ''}${a?.flagged ? ', marked for review' : ''}`}
              aria-current={i === current}
              className={`relative grid h-10 place-items-center rounded-lg text-sm font-bold transition ${answered ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-muted hover:border-primary/50'} ${i === current ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''}`}
            >
              {i + 1}
              {a?.flagged && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-surface bg-warn" />}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-primary" /> Answered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-border" /> Not answered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-warn" /> For review
        </span>
      </div>
    </div>
  );
}

function QuestionView({ q, index, total, answer, onAnswer, disabled, noSelect }) {
  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-muted">
          Question {index + 1} of {total}
        </span>
        <Badge tone="primary">{q.type === 'single' ? 'Choose one' : 'Type your answer'}</Badge>
        <Badge>
          {q.marks} mark{q.marks === 1 ? '' : 's'}
        </Badge>
      </div>
      <h2 className={`whitespace-pre-wrap text-xl font-semibold leading-relaxed text-fg sm:text-2xl ${noSelect ? 'no-select' : ''}`}>{q.text}</h2>
      {q.type === 'single' ? (
        <fieldset className="mt-6 space-y-3" disabled={disabled}>
          <legend className="sr-only">Options</legend>
          {q.options.map((o, i) => {
            const selected = answer?.value === o.key;
            return (
              <label
                key={o.key}
                className={`flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 transition ${selected ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:border-primary/40'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input type="radio" name={`q-${q._id}`} className="sr-only" checked={selected} onChange={() => onAnswer({ value: o.key })} />
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${selected ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted'}`}>{String.fromCharCode(65 + i)}</span>
                <span className={`pt-0.5 text-base text-fg ${noSelect ? 'no-select' : ''}`}>{o.text}</span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <div className="mt-6">
          <input
            className="input py-3 text-lg"
            placeholder="Type your answer"
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={answer?.value ?? ''}
            onChange={(e) => onAnswer({ value: e.target.value }, { debounce: 600 })}
            aria-label={`Answer for question ${index + 1}`}
          />
          <p className="mt-2 text-xs text-subtle">Capital letters and spaces at either end don't matter.</p>
        </div>
      )}
    </div>
  );
}

export default function ExamPage() {
  const { assessmentId } = useParams();
  const [search] = useSearchParams();
  const roomId = search.get('room') || undefined;
  const navigate = useNavigate();
  const info = useApi(`/assessments/${assessmentId}`);
  const clock = useServerClock(250);

  const [exam, setExam] = useState(null);
  const [phase, setPhase] = useState('gate'); // gate | exam | finished | duplicate
  const [starting, setStarting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [deadline, setDeadline] = useState(null);
  const [paused, setPaused] = useState(null); // remaining seconds while paused
  const [violation, setViolation] = useState(null);
  const [violationCount, setViolationCount] = useState(0);
  const [message, setMessage] = useState(null);
  const [finish, setFinish] = useState(null); // { reason, submittedAt, message }
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const finishing = useRef(false);

  const attemptId = exam?.attempt.id;
  const policy = useMemo(() => exam?.assessment.proctoring || info.data?.proctoring || {}, [exam, info.data]);
  const questions = exam?.questions || [];
  const { answers, update, flushAll, status, lastSavedAt } = useAnswers(attemptId, exam?.attempt.answers, { enabled: phase === 'exam' && paused == null });

  const end = useCallback(
    async (reason, extra = {}) => {
      if (finishing.current) return;
      finishing.current = true;
      setViolation(null);
      setPaused(null);
      setFinish({ reason, submittedAt: extra.submittedAt || new Date().toISOString(), message: extra.message });
      setPhase('finished');
      if (attemptId) clearBackup(attemptId);
      await exitFullscreen();
    },
    [attemptId],
  );

  const applyExam = useCallback(
    (data) => {
      clock.sync(data.serverNow);
      setExam(data);
      setViolationCount(data.attempt.violationCount || 0);
      setDeadline(new Date(data.attempt.deadlineAt).getTime());
      setPaused(data.assessment.state === 'PAUSED' ? data.attempt.remainingSeconds : null);
      if (data.attempt.state !== 'IN_PROGRESS') {
        finishing.current = false;
        end(data.attempt.submitReason || 'MANUAL', { submittedAt: data.attempt.submittedAt });
      } else setPhase('exam');
    },
    [clock, end],
  );

  const begin = async () => {
    const p = info.data?.proctoring || {};
    if (p.enabled && p.requireFullscreen && document.fullscreenEnabled && !(await enterFullscreen())) {
      toast.error('Allow fullscreen to start the quiz');
      return;
    }
    setStarting(true);
    try {
      applyExam(await api.post(`/assessments/${assessmentId}/start`, { roomId }));
    } catch (err) {
      await exitFullscreen();
      toast.error(String(err));
    } finally {
      setStarting(false);
    }
  };

  // ---- proctoring ------------------------------------------------------------
  const report = useCallback(
    async (type, details) => {
      if (finishing.current || !attemptId) return;
      if (FOCUS_EVENTS.has(type)) setViolation((v) => v || { type, count: null });
      try {
        const r = await api.post(`/attempts/${attemptId}/proctoring-events`, { type, details });
        setViolationCount(r.count);
        if (r.counted) setViolation((v) => (v ? { ...v, count: r.count } : { type, count: r.count }));
        else if (FOCUS_EVENTS.has(type)) setViolation((v) => (v && v.count == null ? { ...v, count: r.count } : v));
        if (r.autoSubmitted) end('PROCTORING_LIMIT');
      } catch (err) {
        if (/not active/i.test(String(err))) {
          const fresh = await api.get(`/attempts/${attemptId}`).catch(() => null);
          if (fresh) applyExam(fresh);
        }
      }
    },
    [attemptId, end, applyExam],
  );

  useProctoring({
    active: phase === 'exam',
    policy,
    attemptId,
    report,
    onBlocked: (text) => toast(text, { id: 'blocked', icon: '🚫' }),
    onDuplicate: () => setPhase((p) => (p === 'exam' ? 'duplicate' : p)),
  });

  const needsFullscreen = Boolean(policy.enabled && policy.requireFullscreen && document.fullscreenEnabled);
  const continueAfterViolation = async () => {
    if (needsFullscreen && !document.fullscreenElement && !(await enterFullscreen())) return toast.error('Fullscreen is required to continue');
    setViolation(null);
  };

  // ---- realtime --------------------------------------------------------------
  const forThis = (payload) => payload?.attemptId === attemptId;
  useSocketEvent('assessment:paused', (p) => forThis(p) && setPaused(p.remainingSeconds));
  useSocketEvent('assessment:resumed', (p) => {
    if (!forThis(p)) return;
    setDeadline(new Date(p.deadlineAt).getTime());
    setPaused(null);
    toast.success('The quiz has resumed');
  });
  useSocketEvent('assessment:ended', (p) => forThis(p) && end('ASSESSMENT_ENDED'));
  useSocketEvent('attempt:force-submitted', (p) => forThis(p) && end(p.reason || 'TEACHER', { message: p.message }));
  useSocketEvent('attempt:extended', (p) => {
    if (!forThis(p)) return;
    setDeadline(new Date(p.deadlineAt).getTime());
    toast.success(`Your teacher added ${p.minutes} minute${p.minutes === 1 ? '' : 's'}`);
  });
  useSocketEvent('attempt:message', (p) => forThis(p) && setMessage(p));

  // Heartbeat so the teacher's monitor shows this student as connected.
  useEffect(() => {
    if (phase !== 'exam' || !attemptId) return;
    const socket = getSocket();
    const beat = () => socket.emit('attempt:heartbeat', { attemptId });
    beat();
    socket.on('connect', beat);
    const id = setInterval(beat, 15_000);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      clearInterval(id);
      socket.off('connect', beat);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [phase, attemptId]);

  // ---- timing ----------------------------------------------------------------
  const remaining = paused != null ? paused : deadline ? Math.max(0, Math.floor((deadline - clock.now) / 1000)) : 0;
  useEffect(() => {
    if (phase !== 'exam' || paused != null || !deadline || remaining > 0 || finishing.current) return;
    if (deadline - clock.serverTime() > 0) return; // guard against a stale tick before the clock syncs
    (async () => {
      await flushAll();
      try {
        const r = await api.post(`/attempts/${attemptId}/submit`);
        end(r.submitReason || 'TIMEOUT', { submittedAt: r.submittedAt });
      } catch {
        end('TIMEOUT');
      }
    })();
  }, [remaining, phase, paused, deadline, attemptId, flushAll, end, clock]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await flushAll();
      const r = await api.post(`/attempts/${attemptId}/submit`);
      setConfirmOpen(false);
      end(r.submitReason || 'MANUAL', { submittedAt: r.submittedAt });
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard navigation between questions (arrow keys outside text inputs).
  useEffect(() => {
    if (phase !== 'exam') return;
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(questions.length - 1, c + 1));
      if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, questions.length]);

  // ---- render ----------------------------------------------------------------
  if (info.loading && !info.data)
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-muted">
        <Spinner /> Preparing your quiz…
      </div>
    );
  if (info.error)
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert tone="danger" title="This quiz isn't available">
          {info.error}
          <div className="mt-3">
            <Button onClick={() => navigate('/assessments')}>Back to assessments</Button>
          </div>
        </Alert>
      </div>
    );
  if (phase === 'duplicate') return <DuplicateTabOverlay />;
  if (phase === 'finished') return <FinishedScreen reason={finish?.reason} submittedAt={finish?.submittedAt} message={finish?.message} title={info.data?.title} onDone={() => navigate('/assessments')} />;
  if (phase === 'gate' || !exam) return <Gate info={info.data} resuming={info.data?.state && search.get('resume') === '1'} busy={starting} onBegin={begin} onBack={() => navigate('/assessments')} />;

  const q = questions[current];
  const answeredCount = questions.filter((x) => isAnswered(answers[x._id])).length;
  const flagged = questions.filter((x) => answers[x._id]?.flagged).length;
  const unanswered = questions.map((x, i) => (!isAnswered(answers[x._id]) ? i + 1 : null)).filter(Boolean);
  const locked = paused != null;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-bold text-fg">{exam.assessment.title}</p>
            <div className="flex flex-wrap items-center gap-3">
              <SaveStatus status={status} lastSavedAt={lastSavedAt} />
              <span className={`inline-flex items-center gap-1 text-xs ${online ? 'text-subtle' : 'font-semibold text-danger'}`}>
                {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {online ? 'Connected' : 'No connection'}
              </span>
            </div>
          </div>
          {policy.enabled && policy.maxViolations > 0 && (
            <Badge tone={violationCount === 0 ? 'neutral' : violationCount >= policy.maxViolations - 1 ? 'danger' : 'warn'} className="hidden sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Warnings {violationCount}/{policy.maxViolations}
            </Badge>
          )}
          <Timer seconds={remaining} paused={locked} />
          <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={locked}>
            Submit
          </Button>
        </div>
        <div className="h-1 bg-surface-2">
          <div className="h-full bg-primary transition-all" style={{ width: `${(answeredCount / (questions.length || 1)) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_17rem]">
        <main className="min-w-0">
          <div className="mb-4 lg:hidden">
            <Button size="sm" icon={Grid3x3} onClick={() => setPaletteOpen((o) => !o)}>
              {answeredCount}/{questions.length} answered
            </Button>
            {paletteOpen && (
              <div className="card mt-3 p-4">
                <Palette questions={questions} answers={answers} current={current} onJump={(i) => (setCurrent(i), setPaletteOpen(false))} />
              </div>
            )}
          </div>
          <div className="card p-6 sm:p-8">
            {q && <QuestionView key={q._id} q={q} index={current} total={questions.length} answer={answers[q._id]} disabled={locked} noSelect={policy.enabled && policy.blockClipboard} onAnswer={(patch, opts) => update(q._id, patch, opts)} />}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button icon={ArrowLeft} disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
              Previous
            </Button>
            <Button variant="ghost" icon={answers[q?._id]?.flagged ? BookmarkCheck : Bookmark} disabled={locked} onClick={() => update(q._id, { flagged: !answers[q._id]?.flagged })} className={answers[q?._id]?.flagged ? '!text-warn' : ''}>
              {answers[q?._id]?.flagged ? 'Marked for review' : 'Mark for review'}
            </Button>
            <div className="ml-auto">
              {current < questions.length - 1 ? (
                <Button variant="primary" onClick={() => setCurrent((c) => c + 1)}>
                  Next <ArrowRight />
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={locked}>
                  Review and submit
                </Button>
              )}
            </div>
          </div>
        </main>
        <aside className="hidden lg:block">
          <div className="card sticky top-24 p-5">
            <p className="mb-4 flex items-center justify-between text-sm font-semibold">
              Questions
              <span className="font-normal text-muted">
                {answeredCount}/{questions.length} answered
              </span>
            </p>
            <Palette questions={questions} answers={answers} current={current} onJump={setCurrent} />
            {policy.enabled && (
              <p className="mt-5 flex gap-2 border-t border-border pt-4 text-xs text-subtle">
                <ShieldCheck className="h-4 w-4 shrink-0" /> Proctored. Stay on this screen until you submit.
              </p>
            )}
          </div>
        </aside>
      </div>

      {confirmOpen && (
        <Modal
          size="sm"
          title="Submit your quiz?"
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <Button onClick={() => setConfirmOpen(false)}>Keep working</Button>
              <Button variant="primary" loading={submitting} onClick={submit}>
                Submit now
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-success-soft p-3">
              <p className="font-display text-2xl font-bold text-success">{answeredCount}</p>
              <p className="text-xs text-muted">answered</p>
            </div>
            <div className={`rounded-lg p-3 ${unanswered.length ? 'bg-danger-soft' : 'bg-surface-2'}`}>
              <p className={`font-display text-2xl font-bold ${unanswered.length ? 'text-danger' : 'text-muted'}`}>{unanswered.length}</p>
              <p className="text-xs text-muted">unanswered</p>
            </div>
            <div className={`rounded-lg p-3 ${flagged ? 'bg-warn-soft' : 'bg-surface-2'}`}>
              <p className={`font-display text-2xl font-bold ${flagged ? 'text-warn' : 'text-muted'}`}>{flagged}</p>
              <p className="text-xs text-muted">for review</p>
            </div>
          </div>
          {unanswered.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              Unanswered:{' '}
              {unanswered.map((n) => (
                <button key={n} type="button" className="mx-0.5 font-semibold text-primary underline-offset-2 hover:underline" onClick={() => (setCurrent(n - 1), setConfirmOpen(false))}>
                  Q{n}
                </button>
              ))}
            </p>
          )}
          <p className="mt-4 text-sm text-muted">You can't change your answers after submitting.</p>
        </Modal>
      )}
      {violation && !locked && <ViolationOverlay violation={violation} policy={policy} needsFullscreen={needsFullscreen && !document.fullscreenElement} onContinue={continueAfterViolation} />}
      {locked && <PausedOverlay remainingSeconds={paused} />}
      {message && !locked && <MessageOverlay message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
