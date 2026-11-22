import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Columns3, GripVertical, List, Lock, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fmtDateTime } from '../../lib/format.js';
import { TYPE_LEGEND, byDay, dayKey, monthGrid, moveToDay, rangeFor, sameDay, startOfDay, step, toLocalInput, toneFor, weekDays } from '../../lib/calendar.js';
import { Button, EmptyState, Input, Modal, PageHeader, Select, Spinner, Tabs, Textarea, useConfirm } from '../../components/ui/index.js';

const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(d).toLocaleDateString([], opts);
const LINK_HREF = { assessment: '/assessments', assignment: '/assignments', announcement: '/announcements' };
const LINK_NOUN = { assessment: 'quiz', assignment: 'assignment' };

/** One event card. Draggable when the user may reschedule it. */
function EventCard({ e, compact = false, onOpen, onReschedule, onDragStart }) {
  return (
    <div
      draggable={e.canMove}
      onDragStart={(ev) => onDragStart(ev, e)}
      className={`group relative rounded-2xl ${toneFor(e.type)} ${e.canMove ? 'cursor-grab active:cursor-grabbing' : ''} ${compact ? 'px-2 py-1' : 'p-3'} text-tile-ink transition hover:-translate-y-0.5 hover:shadow-lift`}
      data-event-id={e._id}
    >
      <button type="button" onClick={() => onOpen(e)} className="block w-full min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${e.title}, ${e.subject?.code || 'Institution-wide'}, ${dayLabel(e.startAt)} ${time(e.startAt)}`}>
        {compact ? (
          <span className="block truncate text-[11px] font-semibold">
            {time(e.startAt)} {e.title}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold opacity-75">
              {e.canMove ? <GripVertical className="h-3 w-3 shrink-0" aria-hidden /> : <Lock className="h-3 w-3 shrink-0" aria-hidden />}
              {time(e.startAt)}
              {e.subject?.code && <span className="truncate">· {e.subject.code}</span>}
            </span>
            <span className="mt-1 line-clamp-3 block text-[13px] font-bold leading-snug">{e.title}</span>
            <span className="mt-1 block text-[11px] font-medium opacity-70">{e.type}</span>
          </>
        )}
      </button>
      {!compact && e.canMove && (
        <button
          type="button"
          onClick={() => onReschedule(e)}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border border-tile-ink/40 bg-white/40 opacity-0 transition hover:bg-tile-ink hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Reschedule ${e.title}`}
          title="Reschedule"
        >
          <CalendarClock className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** A day that accepts dropped cards. */
function DayDrop({ day, canDrop, onDropTo, className = '', children, label }) {
  const [over, setOver] = useState(false);
  return (
    <section
      aria-label={label}
      onDragOver={(ev) => {
        if (!canDrop) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(ev) => {
        ev.preventDefault();
        setOver(false);
        const id = ev.dataTransfer.getData('text/plain');
        if (id) onDropTo(id, day);
      }}
      data-day={dayKey(day)}
      className={`${className} ${over ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : ''}`}
    >
      {children}
    </section>
  );
}

function RescheduleModal({ event, onClose, onSave }) {
  const [value, setValue] = useState(toLocalInput(event.startAt));
  return (
    <Modal
      title="Reschedule"
      description={`${event.title}${event.subject?.code ? ` · ${event.subject.code}` : ''}`}
      onClose={onClose}
      onSubmit={() => onSave(event, new Date(value))}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Move
          </Button>
        </>
      }
    >
      <Input label="New date and time" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} required data-autofocus />
      {event.link?.kind && LINK_NOUN[event.link.kind] && <p className="mt-3 text-sm text-muted">This also moves the {LINK_NOUN[event.link.kind]} itself, and its students are notified.</p>}
    </Modal>
  );
}

function EventDetails({ event, onClose, onReschedule }) {
  return (
    <Modal
      title={event.title}
      description={`${event.type}${event.subject ? ` · ${event.subject.code} ${event.subject.name}` : ' · Institution-wide'}`}
      onClose={onClose}
      footer={
        <>
          {event.link && LINK_HREF[event.link.kind] && <Button to={LINK_HREF[event.link.kind]}>Open {event.link.kind}</Button>}
          {event.canMove && (
            <Button variant="primary" icon={CalendarClock} onClick={() => onReschedule(event)}>
              Reschedule
            </Button>
          )}
        </>
      }
    >
      <dl className="space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 text-muted">Starts</dt>
          <dd className="font-medium">{fmtDateTime(event.startAt)}</dd>
        </div>
        {event.endAt && +new Date(event.endAt) !== +new Date(event.startAt) && (
          <div className="flex gap-2">
            <dt className="w-16 text-muted">Ends</dt>
            <dd className="font-medium">{fmtDateTime(event.endAt)}</dd>
          </div>
        )}
      </dl>
      {event.description && <p className="mt-4 whitespace-pre-wrap text-sm text-fg/85">{event.description}</p>}
      {!event.canMove && event.moveBlocker && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" /> {event.moveBlocker}
        </p>
      )}
    </Modal>
  );
}

function AddEventModal({ onClose, onSaved, defaultDay }) {
  const [subjects, setSubjects] = useState([]);
  const start = defaultDay ? moveToDay(new Date(new Date().setHours(10, 0, 0, 0)), defaultDay) : new Date();
  const [f, setF] = useState({ title: '', description: '', subject: '', type: 'Academic date', startAt: toLocalInput(start), endAt: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get('/subjects').then(setSubjects).catch(() => {});
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/calendar/events', { ...f, subject: f.subject || undefined, startAt: new Date(f.startAt).toISOString(), endAt: f.endAt ? new Date(f.endAt).toISOString() : undefined });
      toast.success('Event added');
      onSaved();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      title="Add event"
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Add event
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Input label="Title" required value={f.title} onChange={set('title')} data-autofocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" value={f.type} onChange={set('type')}>
            {['Academic date', 'CIE', 'Lab', 'Quiz', 'Holiday', 'Event'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select label="Subject" value={f.subject} onChange={set('subject')}>
            <option value="">Institution-wide</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Starts" type="datetime-local" required value={f.startAt} onChange={set('startAt')} />
          <Input label="Ends" type="datetime-local" value={f.endAt} onChange={set('endAt')} />
        </div>
        <Textarea label="Details" rows={3} value={f.description} onChange={set('description')} />
      </div>
    </Modal>
  );
}

/** Academic calendar as a week board (drag cards between days), month grid or agenda list. */
export default function CalendarBoard() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const staff = user.role !== 'student';
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('calendar-view') || 'week';
    } catch {
      return 'week';
    }
  });
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [hidden, setHidden] = useState(() => new Set());
  const [details, setDetails] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const [adding, setAdding] = useState(null); // null | { day }
  const [announce, setAnnounce] = useState('');

  const [from, to] = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await api.get(`/calendar/events?from=${from.toISOString()}&to=${to.toISOString()}`));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);
  const pickView = (v) => {
    setView(v);
    try {
      localStorage.setItem('calendar-view', v);
    } catch {
      /* ignore */
    }
  };

  const subjects = useMemo(() => [...new Map(events.filter((e) => e.subject).map((e) => [e.subject._id, e.subject])).values()], [events]);
  const typeKey = (t = '') => TYPE_LEGEND.find(([name]) => new RegExp(name.split(' ')[0], 'i').test(t))?.[0] || 'Other';
  const shown = events.filter((e) => (!subject || e.subject?._id === subject) && !hidden.has(typeKey(e.type)));
  const days = byDay(shown);
  const byId = useMemo(() => new Map(events.map((e) => [e._id, e])), [events]);

  /** Moves an event (after confirming when it moves a quiz or assignment). */
  const move = async (event, startAt) => {
    if (!event?.canMove) return;
    if (+startAt === +new Date(event.startAt)) return;
    const noun = event.link?.kind && LINK_NOUN[event.link.kind];
    if (
      noun &&
      !(await confirm({
        title: `Move the ${noun}?`,
        body: `"${event.title}" moves from ${fmtDateTime(event.startAt)} to ${fmtDateTime(startAt)}. Students in ${event.subject?.code || 'the subject'} are notified.`,
        confirmLabel: `Move ${noun}`,
      }))
    )
      return;
    const previous = event.startAt;
    setEvents((list) => list.map((e) => (e._id === event._id ? { ...e, startAt: startAt.toISOString() } : e)));
    try {
      await api.patch(`/calendar/events/${event._id}`, { startAt: startAt.toISOString() });
      const msg = `${event.title} moved to ${dayLabel(startAt)} ${time(startAt)}`;
      setAnnounce(msg);
      toast.success(
        (t) => (
          <span className="flex items-center gap-3">
            {msg}
            {!noun && (
              <button
                type="button"
                className="font-semibold underline"
                onClick={async () => {
                  toast.dismiss(t.id);
                  await api.patch(`/calendar/events/${event._id}`, { startAt: previous }).catch((e) => toast.error(String(e)));
                  load();
                }}
              >
                Undo
              </button>
            )}
          </span>
        ),
        { duration: 6000 },
      );
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRescheduling(null);
      setDetails(null);
      load();
    }
  };

  const onDragStart = (ev, e) => {
    if (!e.canMove) return ev.preventDefault();
    ev.dataTransfer.setData('text/plain', e._id);
    ev.dataTransfer.effectAllowed = 'move';
  };
  const onDropTo = (id, day) => {
    const e = byId.get(id);
    if (e) move(e, moveToDay(e.startAt, day));
  };
  const cardProps = { onOpen: setDetails, onReschedule: setRescheduling, onDragStart };

  const today = new Date();
  const title =
    view === 'month'
      ? anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : view === 'list'
        ? `${dayLabel(from, { day: 'numeric', month: 'short' })} – ${dayLabel(new Date(to - 1), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : `${dayLabel(from, { day: 'numeric', month: 'short' })} – ${dayLabel(new Date(to - 1), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div>
      <PageHeader
        eyebrow={dayLabel(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        title="Academic"
        accent="calendar"
        description={staff ? 'Quizzes, deadlines and academic dates. Drag a card to another day to reschedule it.' : 'Your quizzes, assignment deadlines and academic dates.'}
        actions={
          staff && (
            <Button variant="primary" icon={Plus} onClick={() => setAdding({ day: null })}>
              Add event
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          items={[
            { value: 'week', label: 'Week', icon: Columns3 },
            { value: 'month', label: 'Month', icon: CalendarDays },
            { value: 'list', label: 'List', icon: List },
          ]}
          value={view}
          onChange={pickView}
        />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" icon={ChevronLeft} onClick={() => setAnchor(step(view, anchor, -1))} aria-label="Previous" />
          <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button size="sm" variant="secondary" icon={ChevronRight} onClick={() => setAnchor(step(view, anchor, 1))} aria-label="Next" />
        </div>
        <h2 className="text-base font-bold tracking-tight" aria-live="polite">
          {title}
        </h2>
        {loading && <Spinner className="h-4 w-4 text-muted" />}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {subjects.length > 1 && (
            <select className="input h-8 w-auto rounded-full py-0 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.code}
                </option>
              ))}
            </select>
          )}
          {TYPE_LEGEND.map(([name, tone]) => {
            const on = !hidden.has(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => setHidden((h) => (h.has(name) ? new Set([...h].filter((x) => x !== name)) : new Set([...h, name])))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? 'border-fg/15' : 'border-dashed border-fg/20 opacity-50'}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden />
                {name.replace(' deadline', 's')}
              </button>
            );
          })}
        </div>
      </div>

      {view === 'week' && (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 lg:grid lg:grid-cols-7 lg:overflow-visible">
          {weekDays(anchor).map((d) => {
            const list = days.get(dayKey(d)) || [];
            const isToday = sameDay(d, today);
            const past = startOfDay(d) < startOfDay(today);
            return (
              <DayDrop
                key={dayKey(d)}
                day={d}
                canDrop={staff}
                onDropTo={onDropTo}
                label={`${dayLabel(d)}, ${list.length} event${list.length === 1 ? '' : 's'}`}
                className={`flex min-h-[22rem] w-[15rem] shrink-0 snap-start flex-col rounded-3xl border p-2.5 lg:w-auto ${isToday ? 'border-primary/50 bg-primary-soft/40' : 'border-border/70 bg-surface'} ${past ? 'opacity-75' : ''}`}
              >
                <header className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">{d.toLocaleDateString([], { weekday: 'short' })}</span>
                  <span className={`grid h-8 min-w-8 place-items-center rounded-full px-1.5 text-sm font-bold ${isToday ? 'bg-ink text-ink-fg' : 'text-fg'}`}>{d.getDate()}</span>
                </header>
                <div className="flex flex-1 flex-col gap-2">
                  {list.map((e) => (
                    <EventCard key={e._id} e={e} {...cardProps} />
                  ))}
                  {!list.length && <p className="mt-6 text-center text-xs text-subtle">{staff ? 'Drop here' : 'Nothing scheduled'}</p>}
                </div>
                {staff && (
                  <button type="button" onClick={() => setAdding({ day: d })} className="mt-2 rounded-full py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-fg" aria-label={`Add event on ${dayLabel(d)}`}>
                    + Add
                  </button>
                )}
              </DayDrop>
            );
          })}
        </div>
      )}

      {view === 'month' && (
        <div className="overflow-x-auto">
          <div className="grid min-w-[44rem] grid-cols-7 gap-1.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
              <p key={w} className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                {w}
              </p>
            ))}
            {monthGrid(anchor).map((d) => {
              const list = days.get(dayKey(d)) || [];
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = sameDay(d, today);
              return (
                <DayDrop
                  key={dayKey(d)}
                  day={d}
                  canDrop={staff}
                  onDropTo={onDropTo}
                  label={`${dayLabel(d)}, ${list.length} event${list.length === 1 ? '' : 's'}`}
                  className={`flex min-h-[7rem] flex-col gap-1 rounded-2xl border p-1.5 ${isToday ? 'border-primary/50 bg-primary-soft/40' : 'border-border/70 bg-surface'} ${inMonth ? '' : 'opacity-50'}`}
                >
                  <span className={`self-end rounded-full px-1.5 text-xs font-bold ${isToday ? 'bg-ink text-ink-fg' : 'text-muted'}`}>{d.getDate()}</span>
                  {list.slice(0, 3).map((e) => (
                    <EventCard key={e._id} e={e} compact {...cardProps} />
                  ))}
                  {list.length > 3 && (
                    <button type="button" className="text-left text-[11px] font-semibold text-muted hover:text-fg" onClick={() => (setAnchor(d), pickView('week'))}>
                      +{list.length - 3} more
                    </button>
                  )}
                </DayDrop>
              );
            })}
          </div>
        </div>
      )}

      {view === 'list' &&
        (shown.length ? (
          <ol className="space-y-5">
            {[...days.entries()].map(([k, list]) => (
              <li key={k}>
                <h3 className="mb-2 text-sm font-bold">{dayLabel(list[0].startAt, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((e) => (
                    <li key={e._id}>
                      <EventCard e={e} {...cardProps} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <div className="card">
            <EmptyState icon={CalendarDays} title="Nothing in the next four weeks" />
          </div>
        ))}

      {staff && view !== 'list' && <p className="mt-3 text-xs text-muted">Tip: cards with a lock cannot move (open quizzes, announcements, other subjects). Use the clock button on a card to reschedule with the keyboard.</p>}
      {!staff && (
        <p className="mt-3 text-xs text-muted">
          Times are shown in your device's time zone. Missed something? See <Link to="/notifications" className="underline">notifications</Link>.
        </p>
      )}

      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>
      {details && <EventDetails event={details} onClose={() => setDetails(null)} onReschedule={(e) => (setDetails(null), setRescheduling(e))} />}
      {rescheduling && <RescheduleModal event={rescheduling} onClose={() => setRescheduling(null)} onSave={move} />}
      {adding && <AddEventModal defaultDay={adding.day} onClose={() => setAdding(null)} onSaved={() => (setAdding(null), load())} />}
    </div>
  );
}
