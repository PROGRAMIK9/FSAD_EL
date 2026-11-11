import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, CalendarCheck, Check, CircleSlash, Clock, MessageSquareText, ShieldAlert, Timer, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Button, Card, EmptyState, ScoreRing, SectionTitle, Skeleton, useConfirm } from '../../components/ui/index.js';
import { AnswerReview, tally } from '../../components/domain/AnswerReview.jsx';
import { hueFor } from '../../components/domain/QuizCard.jsx';
import { SUBMIT_REASON } from '../../components/domain/ProctorTimeline.jsx';
import { fmtDateTime, fmtDuration } from '../../lib/format.js';

const REVIEW_TONE = { OPEN: ['warn', 'Review requested'], APPROVED: ['success', 'Review accepted'], REJECTED: ['neutral', 'Review closed'] };

function verdict(pct) {
  if (pct >= 0.9) return 'Outstanding work!';
  if (pct >= 0.7) return 'Great job!';
  if (pct >= 0.4) return 'Good effort, keep going';
  return 'Keep practising, you will get there';
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/15 px-3.5 py-2.5 ring-1 ring-inset ring-white/20">
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
      <div className="leading-tight">
        <p className="font-display text-lg font-bold tabular">{value}</p>
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/80">{label}</p>
      </div>
    </div>
  );
}

export default function AttemptResult() {
  const { assessmentId } = useParams();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi(`/assessments/${assessmentId}/my-result`);

  if (loading && !data)
    return (
      <div className="space-y-5">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    );
  if (error)
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={CalendarCheck}
          title="Result not published yet"
          description="Your teacher hasn't released this result. You'll get a notification the moment it is."
          action={
            <Button icon={ArrowLeft} to="/assessments">
              Back to assessments
            </Button>
          }
        />
      </Card>
    );

  const { assessment: a, grade, attempt, review, items } = data;
  const max = grade.maxMarks || a.maxMarks || 10;
  const counts = tally(items);
  const taken = attempt.startedAt && attempt.submittedAt ? (new Date(attempt.submittedAt) - new Date(attempt.startedAt)) / 1000 : null;

  const requestReview = async () => {
    const message = await confirm({
      title: 'Ask your teacher to review this mark',
      body: 'Say which question you think was marked wrongly and why.',
      confirmLabel: 'Send request',
      input: { placeholder: 'e.g. Q3: I wrote "LIFO stack", which means the same as the accepted answer.', minLength: 5 },
    });
    if (!message) return;
    try {
      await api.post(`/grades/${grade.id}/review`, { message });
      toast.success('Review request sent');
      reload();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" icon={ArrowLeft} to="/assessments" className="-ml-2 mb-3">
        Assessments
      </Button>

      <section className={`card-hero ${hueFor(a.subject?.code)} animate-rise-in p-6 sm:p-8`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <span className="chip chip-light">{a.subject?.code}</span>
              <span className="chip chip-glass">Attempt {attempt.attemptNumber}</span>
              {attempt.submitReason && attempt.submitReason !== 'MANUAL' && <span className="chip chip-glass">{SUBMIT_REASON[attempt.submitReason]}</span>}
            </div>
            <p className="mt-4 text-sm font-medium text-white/85">{a.title}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{verdict(grade.rawMarks / max)}</h1>
            <p className="mt-1.5 text-sm text-white/80">Published {fmtDateTime(grade.publishedAt)}</p>
          </div>
          <div className="self-center rounded-full bg-white/10 p-2 ring-1 ring-inset ring-white/20">
            <ScoreRing score={grade.rawMarks} max={max} size={132} onDark />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat icon={Check} value={counts.correct} label="Correct" />
          <Stat icon={X} value={counts.incorrect} label="Incorrect" />
          <Stat icon={CircleSlash} value={counts.skipped} label="Skipped" />
          <Stat icon={Timer} value={taken != null ? fmtDuration(taken) : '—'} label="Time taken" />
        </div>
      </section>

      {(grade.feedback || attempt.violationCount > 0) && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {grade.feedback && (
            <Card className="p-5 sm:col-span-2">
              <p className="flex items-center gap-2 font-display text-sm font-semibold">
                <MessageSquareText className="h-4 w-4 text-primary" /> Feedback from your teacher
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{grade.feedback}</p>
            </Card>
          )}
          {attempt.violationCount > 0 && (
            <Card className="flex items-center gap-3 p-5 sm:col-span-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn-soft text-warn">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <p className="text-sm text-muted">
                {attempt.violationCount} proctoring warning{attempt.violationCount === 1 ? ' was' : 's were'} recorded during this attempt.
              </p>
            </Card>
          )}
        </div>
      )}

      <section className="mt-9">
        <SectionTitle
          action={
            review ? (
              <Badge tone={REVIEW_TONE[review.status]?.[0]}>{REVIEW_TONE[review.status]?.[1]}</Badge>
            ) : (
              <Button size="sm" variant="ghost" icon={MessageSquareText} onClick={requestReview}>
                Question a mark
              </Button>
            )
          }
        >
          Answer review
        </SectionTitle>
        {review?.response && (
          <Card className="mb-4 p-4 text-sm">
            <p className="font-semibold">Teacher's reply</p>
            <p className="mt-1 text-muted">{review.response}</p>
          </Card>
        )}
        <AnswerReview items={items} />
      </section>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-subtle">
        <Clock className="h-3.5 w-3.5" /> Submitted {fmtDateTime(attempt.submittedAt)} · {attempt.attemptsUsed} attempt{attempt.attemptsUsed === 1 ? '' : 's'} used
      </p>
    </div>
  );
}
