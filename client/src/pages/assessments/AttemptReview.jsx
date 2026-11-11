import { useParams } from 'react-router-dom';
import { ArrowLeft, Check, CircleSlash, History, ShieldAlert, Timer, X } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { Avatar, Badge, Button, Card, CardHeader, CardBody, EmptyState, ScoreRing, SectionTitle, Skeleton, StatusBadge } from '../../components/ui/index.js';
import { AnswerReview, tally } from '../../components/domain/AnswerReview.jsx';
import { ProctorTimeline, SUBMIT_REASON } from '../../components/domain/ProctorTimeline.jsx';
import { fmtDateTime, fmtDuration } from '../../lib/format.js';

function Stat({ icon: Icon, tone, value, label }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-3.5 py-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="leading-tight">
        <p className="font-display text-lg font-bold tabular">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

/** Teacher view of one student's attempt: score, answers and proctoring timeline. */
export default function AttemptReview() {
  const { id, attemptId } = useParams();
  const { data, loading, error } = useApi(`/attempts/${attemptId}`);
  const back = `/assessments/${id}/monitor`;

  if (loading && !data)
    return (
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    );
  if (error)
    return (
      <Card>
        <EmptyState icon={ShieldAlert} title="Attempt unavailable" description={error} action={<Button to={back}>Back to report</Button>} />
      </Card>
    );

  const { attempt: at, student, items, policy } = data;
  const a = at.assessment || {};
  const max = a.maxMarks || 10;
  const counts = tally(items);
  const done = at.state !== 'IN_PROGRESS';
  const taken = at.startedAt && at.submittedAt ? (new Date(at.submittedAt) - new Date(at.startedAt)) / 1000 : null;

  return (
    <>
      <Button variant="ghost" size="sm" icon={ArrowLeft} to={back} className="-ml-2 mb-3">
        {a.title || 'Quiz report'}
      </Button>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Avatar name={student.name} size="xl" ring />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold sm:text-2xl">{student.name}</h1>
              <p className="truncate font-mono text-sm text-muted">{student.usn || student.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="chip bg-ink text-ink-fg">{a.subject?.code}</span>
                <span className="chip">Attempt {at.attemptNumber}</span>
                <StatusBadge state={at.state} />
                {at.submitReason && at.submitReason !== 'MANUAL' && <Badge tone={['PROCTORING_LIMIT', 'TEACHER'].includes(at.submitReason) ? 'danger' : 'neutral'}>{SUBMIT_REASON[at.submitReason]}</Badge>}
              </div>
            </div>
          </div>
          {done && <ScoreRing score={at.score ?? 0} max={max} size={112} />}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border/70 p-5 sm:grid-cols-4">
          <Stat icon={Check} tone="bg-success-soft text-success" value={counts.correct} label="Correct" />
          <Stat icon={X} tone="bg-danger-soft text-danger" value={counts.incorrect} label="Incorrect" />
          <Stat icon={CircleSlash} tone="bg-surface text-muted ring-1 ring-border" value={counts.skipped} label="Skipped" />
          <Stat icon={Timer} tone="bg-primary-soft text-primary-strong" value={taken != null ? fmtDuration(taken) : '—'} label="Time taken" />
        </div>
      </Card>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section className="min-w-0">
          <SectionTitle>Answers</SectionTitle>
          <AnswerReview items={items} perspective="teacher" />
        </section>
        <aside>
          <Card className="xl:sticky xl:top-24">
            <CardHeader
              title="Proctoring timeline"
              description={policy?.enabled ? `${at.violationCount || 0} of ${policy.maxViolations || '∞'} warnings used` : 'Proctoring was off'}
              actions={<History className="h-4 w-4 text-subtle" />}
            />
            <CardBody className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              <ProctorTimeline attempt={{ ...at, events: at.proctoringEvents }} />
            </CardBody>
            <p className="border-t border-border/70 px-5 py-3 text-xs text-subtle">
              Started {fmtDateTime(at.startedAt)}
              {at.submittedAt ? ` · submitted ${fmtDateTime(at.submittedAt)}` : ''}
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
