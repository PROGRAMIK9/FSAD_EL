import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Square,
  Timer,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useSocketEvent } from '../../hooks/useSocketEvent.js';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatusBadge, Tabs, useConfirm } from '../../components/ui/index.js';
import { fmtDateTime } from '../../lib/format.js';

const OPEN_STATES = ['AVAILABLE', 'LIVE', 'PAUSED'];
const PAST_STATES = ['ENDED', 'COMPLETED', 'PUBLISHED', 'CANCELLED'];
const ROOM_JOINABLE = ['SCHEDULED', 'AVAILABLE', 'LIVE', 'PAUSED'];

const submitReasonText = {
  PROCTORING_LIMIT: 'Auto-submitted: proctoring limit',
  TEACHER: 'Submitted by teacher',
  TIMEOUT: 'Submitted when time ran out',
  ASSESSMENT_ENDED: 'Submitted when the quiz ended',
};

function bucket(a, role) {
  if (role === 'student') {
    if (a.myAttempts?.activeId) return 'open';
    if (PAST_STATES.includes(a.state) || (a.myAttempts?.count >= a.attemptsAllowed && !a.myAttempts?.activeId)) return 'done';
    return OPEN_STATES.includes(a.state) ? 'open' : 'upcoming';
  }
  if (a.state === 'DRAFT') return 'draft';
  if (OPEN_STATES.includes(a.state)) return 'open';
  if (a.state === 'SCHEDULED') return 'upcoming';
  return 'done';
}

function Meta({ a }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="font-mono font-semibold text-primary">{a.subject?.code}</span>
      <span className="inline-flex items-center gap-1">
        <Timer className="h-3.5 w-3.5" /> {a.durationMinutes} min
      </span>
      {a.startsAt && (
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" /> {fmtDateTime(a.startsAt)}
          {a.endsAt ? ` – ${fmtDateTime(a.endsAt)}` : ''}
        </span>
      )}
      {a.availabilityMode === 'room' && (
        <span className="inline-flex items-center gap-1">
          <DoorOpen className="h-3.5 w-3.5" /> Live room
        </span>
      )}
      {a.proctoring?.enabled !== false && (
        <span className="inline-flex items-center gap-1">
          <ShieldAlert className="h-3.5 w-3.5" /> Proctored
        </span>
      )}
    </div>
  );
}

function TeacherActions({ a, reload }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(null);
  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      reload();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
    }
  };
  const control = (action, label) => run(action, () => api.post(`/assessments/${a._id}/${action}`), `Quiz ${label}`);

  if (a.state === 'DRAFT')
    return (
      <>
        <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete draft" onClick={async () => (await confirm({ title: 'Delete this draft?', body: `"${a.title}" will be removed. Its questions stay in the bank.`, confirmLabel: 'Delete', tone: 'danger' })) && run('delete', () => api.delete(`/assessments/${a._id}`), 'Draft deleted')} />
        <Button size="sm" icon={Pencil} to={`/assessments/${a._id}/edit`}>
          Edit
        </Button>
        <Button size="sm" variant="primary" icon={Send} loading={busy === 'publish'} onClick={async () => (await confirm({ title: 'Publish quiz?', body: 'Enrolled students will be notified and the quiz can no longer be edited.', confirmLabel: 'Publish' })) && run('publish', () => api.post(`/assessments/${a._id}/publish`), 'Quiz published')}>
          Publish
        </Button>
      </>
    );

  const buttons = [];
  if (a.availabilityMode === 'room' && ['SCHEDULED', 'AVAILABLE'].includes(a.state))
    buttons.push(
      <Button key="room" size="sm" variant="primary" icon={DoorOpen} loading={busy === 'room'} onClick={() => run('room', async () => navigate(`/rooms/${(await api.post('/rooms', { assessment: a._id }))._id}`))}>
        Open room
      </Button>,
    );
  if (a.state === 'LIVE') buttons.push(<Button key="pause" size="sm" icon={Pause} loading={busy === 'pause'} onClick={() => control('pause', 'paused')}>Pause</Button>);
  if (a.state === 'PAUSED') buttons.push(<Button key="resume" size="sm" icon={Play} loading={busy === 'resume'} onClick={() => control('resume', 'resumed')}>Resume</Button>);
  if (OPEN_STATES.includes(a.state))
    buttons.push(
      <Button key="end" size="sm" icon={Square} loading={busy === 'end'} onClick={async () => (await confirm({ title: 'End quiz for everyone?', body: 'All attempts in progress are submitted immediately. This cannot be undone.', confirmLabel: 'End quiz', tone: 'danger' })) && control('end', 'ended')}>
        End
      </Button>,
    );
  if (OPEN_STATES.includes(a.state) || a.attemptStats?.submitted)
    buttons.push(
      <Button key="monitor" size="sm" variant={OPEN_STATES.includes(a.state) ? 'primary' : 'secondary'} icon={OPEN_STATES.includes(a.state) ? Radio : BarChart3} to={`/assessments/${a._id}/monitor`}>
        {OPEN_STATES.includes(a.state) ? 'Monitor' : 'Report'}
      </Button>,
    );
  return buttons;
}

function StudentActions({ a }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const mine = a.myAttempts || {};
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
  if (mine.activeId)
    return (
      <Button size="sm" variant="primary" icon={RotateCcw} to={`/exam/${a._id}?resume=1`}>
        Resume
      </Button>
    );
  const attemptsLeft = (a.attemptsAllowed || 1) - (mine.count || 0);
  if (a.availabilityMode === 'room' && ROOM_JOINABLE.includes(a.state) && attemptsLeft > 0)
    return (
      <Button size="sm" variant="primary" icon={DoorOpen} onClick={join}>
        Join room
      </Button>
    );
  if (['AVAILABLE', 'LIVE'].includes(a.state) && attemptsLeft > 0)
    return (
      <Button size="sm" variant="primary" icon={Play} to={`/exam/${a._id}`}>
        {mine.count ? 'Retake' : 'Start'}
      </Button>
    );
  if (mine.count)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-4 w-4" /> {submitReasonText[mine.lastSubmitReason] || 'Submitted'}
        {a.state === 'PUBLISHED' && (
          <Button size="sm" variant="ghost" to="/grades" className="ml-1">
            View result
          </Button>
        )}
      </span>
    );
  return null;
}

export default function Assessments() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const { data, loading, reload } = useApi('/assessments', { initial: [] });
  const [tab, setTab] = useState(isStudent ? 'open' : 'all');
  const [query, setQuery] = useState('');
  useSocketEvent('notification:new', reload);
  useSocketEvent('assessment:ended', reload);

  const counts = useMemo(() => data.reduce((acc, a) => ({ ...acc, [bucket(a, user.role)]: (acc[bucket(a, user.role)] || 0) + 1 }), {}), [data, user.role]);
  const tabs = isStudent
    ? [
        { value: 'open', label: 'Open now', count: counts.open || 0 },
        { value: 'upcoming', label: 'Upcoming', count: counts.upcoming || 0 },
        { value: 'done', label: 'Completed', count: counts.done || 0 },
      ]
    : [
        { value: 'all', label: 'All', count: data.length },
        { value: 'draft', label: 'Drafts', count: counts.draft || 0 },
        { value: 'upcoming', label: 'Scheduled', count: counts.upcoming || 0 },
        { value: 'open', label: 'Open / live', count: counts.open || 0 },
        { value: 'done', label: 'Past', count: counts.done || 0 },
      ];
  const rows = data.filter((a) => (tab === 'all' || bucket(a, user.role) === tab) && `${a.title} ${a.subject?.code}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Assessments"
        description={isStudent ? 'Your quizzes: start, resume, or check how you did.' : 'Build, schedule, run and monitor 10-mark quizzes.'}
        actions={
          !isStudent && (
            <Button variant="primary" icon={Plus} to="/assessments/new">
              New quiz
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs items={tabs} value={tab} onChange={setTab} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input className="input pl-9" placeholder="Search quizzes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <Card>
        {loading && !data.length ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((a) => (
              <li key={a._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-fg">{a.title}</p>
                    <StatusBadge state={a.state} />
                    {!isStudent && a.attemptStats?.inProgress > 0 && (
                      <Badge tone="info">
                        <Users className="h-3 w-3" /> {a.attemptStats.inProgress} writing
                      </Badge>
                    )}
                    {!isStudent && a.attemptStats?.submitted > 0 && <Badge>{a.attemptStats.submitted} submitted</Badge>}
                  </div>
                  <Meta a={a} />
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">{isStudent ? <StudentActions a={a} /> : <TeacherActions a={a} reload={reload} />}</div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title={data.length ? 'Nothing here' : isStudent ? 'No quizzes yet' : 'No quizzes yet'}
            description={isStudent ? 'Quizzes from your subjects appear here once published.' : 'Create a quiz from your question bank. It takes a couple of minutes.'}
            action={
              !isStudent &&
              !data.length && (
                <Button variant="primary" icon={Plus} to="/assessments/new">
                  Create your first quiz
                </Button>
              )
            }
          />
        )}
      </Card>
    </>
  );
}
