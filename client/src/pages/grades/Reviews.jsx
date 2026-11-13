import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, Check, CheckCircle2, Inbox, MessageSquareQuote, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Avatar, Badge, Button, Card, Drawer, EmptyState, Input, PageHeader, Skeleton, Tabs, Textarea } from '../../components/ui/index.js';
import { fmtDateTime, fmtRelative } from '../../lib/format.js';

const STATUS = { OPEN: ['warn', 'Open'], APPROVED: ['success', 'Accepted'], REJECTED: ['neutral', 'Declined'] };

function ResolveDrawer({ review, onClose, onDone }) {
  const g = review.grade;
  const [decision, setDecision] = useState('APPROVED');
  const [marks, setMarks] = useState(String(g.rawMarks ?? ''));
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const max = g.maxMarks ?? 10;
  const markValue = marks === '' ? undefined : Number(marks);
  const invalidMarks = decision === 'APPROVED' && markValue !== undefined && (Number.isNaN(markValue) || markValue < 0 || markValue > max);

  const submit = async () => {
    if (response.trim().length < 3) return toast.error('Write a short reply for the student');
    if (invalidMarks) return toast.error(`Marks must be between 0 and ${max}`);
    setBusy(true);
    try {
      await api.patch(`/grade-reviews/${review._id}`, {
        status: decision,
        response: response.trim(),
        ...(decision === 'APPROVED' && markValue !== undefined && markValue !== g.rawMarks ? { correctedMarks: markValue } : {}),
      });
      toast.success(decision === 'APPROVED' ? 'Review accepted. The student has been notified.' : 'Reply sent to the student');
      onDone();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Review: ${review.student?.name}`}
      description={`${g.assessment?.subject?.code} · ${g.assessment?.title}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit} icon={decision === 'APPROVED' ? Check : X}>
            {decision === 'APPROVED' ? 'Accept and reply' : 'Decline and reply'}
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <MessageSquareQuote className="h-4 w-4" /> Student's request · {fmtRelative(review.createdAt)}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{review.message}</p>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-border p-4">
        <div>
          <p className="text-xs text-muted">Current mark</p>
          <p className="font-display text-2xl font-bold tabular">
            {g.rawMarks}
            <span className="text-base text-muted">/{max}</span>
          </p>
        </div>
        {g.attempt && (
          <Button size="sm" to={`/assessments/${g.assessment?._id}/attempts/${g.attempt}`}>
            Open answers <ArrowRight />
          </Button>
        )}
      </div>

      <p className="label mt-6">Decision</p>
      <Tabs
        value={decision}
        onChange={setDecision}
        items={[
          { value: 'APPROVED', label: 'Accept', icon: Check },
          { value: 'REJECTED', label: 'Decline', icon: X },
        ]}
      />
      {decision === 'APPROVED' && (
        <Input
          className="mt-4"
          label="Corrected mark"
          type="number"
          min={0}
          max={max}
          step={0.5}
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
          hint={`Leave at ${g.rawMarks} to accept without changing the mark. Maximum ${max}.`}
          error={invalidMarks ? `Enter a mark from 0 to ${max}` : undefined}
        />
      )}
      <Textarea className="mt-4" label="Reply to the student" required rows={4} value={response} onChange={(e) => setResponse(e.target.value)} placeholder={decision === 'APPROVED' ? 'e.g. Q3: your answer is acceptable; one mark added.' : 'e.g. Q3 asks for the protocol, not the port number, so the mark stands.'} />
    </Drawer>
  );
}

function ReviewCard({ r, onRespond }) {
  const g = r.grade || {};
  const [tone, label] = STATUS[r.status] || STATUS.OPEN;
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={r.student?.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-semibold">{r.student?.name}</p>
            <span className="font-mono text-xs text-muted">{r.student?.usn || r.student?.email}</span>
            <Badge tone={tone} dot>
              {label}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <span className="chip mr-1.5 bg-ink text-ink-fg">{g.assessment?.subject?.code}</span>
            {g.assessment?.title} · mark {g.rawMarks}/{g.maxMarks} · {fmtDateTime(r.createdAt)}
          </p>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 px-4 py-3 text-sm">"{r.message}"</p>
          {r.response && (
            <p className="mt-2 flex gap-2 text-sm text-muted">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>
                <span className="font-medium text-fg">{r.resolvedBy?.name || 'Teacher'}:</span> {r.response}
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-2 sm:flex-col sm:items-end">
          {g.attempt && (
            <Button size="sm" variant="ghost" to={`/assessments/${g.assessment?._id}/attempts/${g.attempt}`}>
              Answers <ArrowRight />
            </Button>
          )}
          {r.status === 'OPEN' && (
            <Button size="sm" variant="primary" onClick={() => onRespond(r)}>
              Respond
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Teacher/admin inbox for students' "question a mark" requests. */
export default function Reviews() {
  const [tab, setTab] = useState('OPEN');
  const { data, loading, reload } = useApi(`/grade-reviews?status=${tab}`, { initial: [] });
  const [active, setActive] = useState(null);

  return (
    <>
      <PageHeader eyebrow="Results" title="Review requests" description="Students who think a quiz answer was marked wrongly. Check their answers, then accept (optionally changing the mark) or decline with a reply." />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'OPEN', label: 'Open', count: tab === 'OPEN' ? data.length : undefined },
          { value: 'RESOLVED', label: 'Resolved', count: tab === 'RESOLVED' ? data.length : undefined },
        ]}
      />
      {loading && !data.length ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : data.length ? (
        <div className="space-y-4">
          {data.map((r) => (
            <ReviewCard key={r._id} r={r} onRespond={setActive} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={Inbox} title={tab === 'OPEN' ? 'No open requests' : 'Nothing resolved yet'} description={tab === 'OPEN' ? 'When a student questions a mark from their result page, it appears here.' : undefined} />
        </Card>
      )}
      {active && (
        <ResolveDrawer
          review={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            reload();
            window.dispatchEvent(new Event('reviews:changed'));
          }}
        />
      )}
    </>
  );
}
