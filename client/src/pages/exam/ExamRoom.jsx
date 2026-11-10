import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, DoorOpen, Play, Radio, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { getSocket } from '../../lib/socket.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocketEvent } from '../../hooks/useSocketEvent.js';
import { Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Spinner, StatusBadge } from '../../components/ui/index.js';
import { PageLoader } from '../../components/layout/PageLoader.jsx';

export default function ExamRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isTeacher = user.role !== 'student';
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  const load = useCallback(
    () =>
      api
        .get(`/rooms/${id}`)
        .then(setRoom)
        .catch((e) => setError(String(e))),
    [id],
  );

  useEffect(() => {
    load();
    const socket = getSocket();
    const join = () => socket.emit('room:join', { roomId: id });
    join();
    socket.on('connect', join);
    return () => socket.off('connect', join);
  }, [id, load]);

  const enter = useCallback(() => navigate(`/exam/${room.assessment._id}?room=${id}`), [navigate, room, id]);

  useSocketEvent('room:participant-joined', load);
  useSocketEvent('room:error', (e) => {
    setStarting(false);
    setError(e.message);
  });
  useSocketEvent('room:start', () => {
    setStarting(false);
    if (isTeacher) {
      toast.success('Quiz started for the room');
      load();
    } else if (room) enter();
  });

  // A student who arrives after the start goes straight in.
  if (!isTeacher && room?.status === 'LIVE') return <Navigate to={`/exam/${room.assessment._id}?room=${id}`} replace />;
  if (!room && !error) return <PageLoader label="Connecting to the room…" />;

  const start = () => {
    setStarting(true);
    setError('');
    getSocket().emit('room:start', { roomId: id });
  };
  const copy = () => navigator.clipboard?.writeText(room.code).then(() => toast.success('Room code copied'));

  return (
    <>
      <PageHeader
        eyebrow="Examination room"
        title={room?.assessment?.title || 'Room'}
        description={isTeacher ? 'Share the code. When everyone has joined, start the quiz for the whole room.' : 'Wait here. The quiz opens for everyone when your teacher starts it.'}
        actions={room && <StatusBadge state={room.status === 'WAITING' ? 'SCHEDULED' : room.status} />}
      />
      {error && (
        <Alert tone="danger" className="mb-4" title="Room problem">
          {error}
        </Alert>
      )}
      {room && (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <Card className="h-fit p-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <DoorOpen className="h-7 w-7" />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Room code</p>
            <button type="button" onClick={copy} className="mt-1 inline-flex items-center gap-2 rounded-lg px-2 py-1 font-mono text-2xl font-bold tracking-wider hover:bg-surface-2" title="Copy code">
              {room.code} <Copy className="h-4 w-4 text-subtle" />
            </button>
            <p className="mt-2 text-sm text-muted">{room.assessment?.durationMinutes} minute quiz</p>
            {isTeacher ? (
              room.status === 'WAITING' ? (
                <Button variant="primary" icon={Play} className="mt-6 w-full py-2.5" loading={starting} onClick={start}>
                  Start quiz for {room.participants.length} student{room.participants.length === 1 ? '' : 's'}
                </Button>
              ) : (
                <Button variant="primary" icon={Radio} className="mt-6 w-full" to={`/assessments/${room.assessment._id}/monitor`}>
                  Open live monitor
                </Button>
              )
            ) : (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-surface-2/60 p-3 text-sm text-muted">
                <Spinner className="h-4 w-4" /> Waiting for {room.teacher?.name || 'your teacher'} to start…
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Participants" description="Students who have entered the room code" actions={<Badge tone="primary">{room.participants.length}</Badge>} />
            {room.participants.length ? (
              <ul className="grid gap-px bg-border sm:grid-cols-2">
                {room.participants.map((p) => (
                  <li key={p._id} className="flex items-center gap-3 bg-surface px-5 py-3">
                    <Avatar name={p.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {p.name}
                        {p._id === user.id && <span className="text-muted"> (you)</span>}
                      </p>
                      <p className="font-mono text-xs text-muted">{p.usn || p.role}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Users} title="No one has joined yet" description="Students join from Assessments → Join room." />
            )}
          </Card>
        </div>
      )}
    </>
  );
}

/** Old links (/attempt/:id) resolve to the exam page for that attempt's quiz. */
export function AttemptRedirect() {
  const { id } = useParams();
  const [target, setTarget] = useState(null);
  useEffect(() => {
    api
      .get(`/attempts/${id}`)
      .then((r) => setTarget(`/exam/${r.assessment.id}?resume=1`))
      .catch(() => setTarget('/assessments'));
  }, [id]);
  return target ? <Navigate to={target} replace /> : <PageLoader />;
}
