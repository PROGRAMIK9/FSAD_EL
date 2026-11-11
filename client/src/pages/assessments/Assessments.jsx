import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  DoorOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
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
import { QuizCard, hueFor } from '../../components/domain/QuizCard.jsx';
import { fmtDateTime } from '../../lib/format.js';

const OPEN_STATES = ['AVAILABLE', 'LIVE', 'PAUSED'];
const PAST_STATES = ['ENDED', 'COMPLETED', 'PUBLISHED', 'CANCELLED'];

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

export default function Assessments() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const { data, loading, reload } = useApi('/assessments', { initial: [] });
  const [tab, setTab] = useState(isStudent ? 'open' : 'all');
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') || '');
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
      {loading && !data.length ? (
        <div className={isStudent ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3' : 'card space-y-3 p-5'}>
          {Array.from({ length: isStudent ? 3 : 4 }, (_, i) => (
            <Skeleton key={i} className={isStudent ? 'h-56 rounded-3xl' : 'h-16'} />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={data.length ? 'Nothing here' : 'No quizzes yet'}
            description={isStudent ? (tab === 'open' ? 'No quiz is open right now. Upcoming quizzes appear in the next tab.' : 'Quizzes from your subjects appear here once published.') : 'Create a quiz from your question bank. It takes a couple of minutes.'}
            action={
              !isStudent &&
              !data.length && (
                <Button variant="primary" icon={Plus} to="/assessments/new">
                  Create your first quiz
                </Button>
              )
            }
          />
        </Card>
      ) : isStudent ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((a, i) => (
            <QuizCard key={a._id} a={a} hero={tab === 'open'} className="animate-rise-in" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      ) : (
        <Card>
          <ul className="divide-y divide-border/70">
            {rows.map((a) => (
              <li key={a._id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-surface-2/40 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className={`card-hero ${hueFor(a.subject?.code)} grid h-12 w-12 shrink-0 place-items-center !rounded-2xl !shadow-none font-display text-[11px] font-bold`}>{a.subject?.code}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-display font-semibold text-fg">{a.title}</p>
                      <StatusBadge state={a.state} />
                      {a.attemptStats?.inProgress > 0 && (
                        <Badge tone="info">
                          <Users className="h-3 w-3" /> {a.attemptStats.inProgress} writing
                        </Badge>
                      )}
                      {a.attemptStats?.submitted > 0 && <Badge>{a.attemptStats.submitted} submitted</Badge>}
                    </div>
                    <Meta a={a} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <TeacherActions a={a} reload={reload} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
