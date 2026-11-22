import { AcademicCalendarEvent, Assessment, Assignment, Attempt, Subject } from '../models/index.js';
import { notify } from './notifications.js';

/** Assessment states whose dates may still move (nobody can have started). */
export const MOVABLE_ASSESSMENT_STATES = ['DRAFT', 'SCHEDULED'];

/**
 * Why `user` may not move `event`, or null when they may. `ctx` holds what the caller already
 * loaded: `taught` (subject ids the teacher teaches) and `linked` (source record, with `attempts`
 * for assessments).
 */
export function moveBlocker(event, user, { taught = [], linked } = {}) {
  if (user.role === 'student') return 'Students cannot reschedule';
  if (event.source?.kind === 'announcement') return 'Announcements are fixed at their publication time';
  const subjectId = event.subject?._id || event.subject;
  if (user.role === 'teacher') {
    if (!subjectId) return 'Only administrators move institution-wide dates';
    if (!taught.some((id) => String(id) === String(subjectId))) return 'Not allocated to this subject';
  }
  if (event.source?.kind === 'assessment') {
    if (!linked) return 'The quiz no longer exists';
    if (!MOVABLE_ASSESSMENT_STATES.includes(linked.state)) return 'The quiz has already opened';
    if (linked.attempts > 0) return 'Students have already started this quiz';
  }
  if (event.source?.kind === 'assignment' && !linked) return 'The assignment no longer exists';
  return null;
}

/** Loads the records events point to, keyed by "kind:id". */
export async function loadLinked(events) {
  const ids = (kind) => events.filter((e) => e.source?.kind === kind).map((e) => e.source.id);
  const [assessments, assignments] = await Promise.all([
    Assessment.find({ _id: { $in: ids('assessment') } })
      .select('state startsAt endsAt title')
      .lean(),
    Assignment.find({ _id: { $in: ids('assignment') } })
      .select('dueAt title')
      .lean(),
  ]);
  const counts = assessments.length
    ? await Attempt.aggregate([
        { $match: { assessment: { $in: assessments.map((a) => a._id) } } },
        { $group: { _id: '$assessment', n: { $sum: 1 } } },
      ])
    : [];
  const attempts = new Map(counts.map((c) => [String(c._id), c.n]));
  const out = new Map();
  for (const a of assessments)
    out.set(`assessment:${a._id}`, { ...a, attempts: attempts.get(String(a._id)) || 0 });
  for (const a of assignments) out.set(`assignment:${a._id}`, a);
  return out;
}

export const linkedOf = (event, map) =>
  event.source?.kind ? map.get(`${event.source.kind}:${event.source.id}`) : undefined;

export async function taughtSubjectIds(user) {
  return user.role === 'teacher' ? Subject.find({ teachers: user._id }).distinct('_id') : [];
}

const fmt = (d) =>
  d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

/**
 * Moves an event to `startAt` (keeping its length) and the quiz or assignment it belongs to by the
 * same amount, then tells the subject's students. Throws { status, message } when not allowed.
 */
export async function rescheduleEvent(eventId, startAt, user, app) {
  const event = await AcademicCalendarEvent.findById(eventId);
  if (!event) throw Object.assign(new Error('Event not found'), { status: 404 });
  const linkedMap = await loadLinked([event]);
  const linked = linkedOf(event, linkedMap);
  const blocker = moveBlocker(event, user, { taught: await taughtSubjectIds(user), linked });
  if (blocker) throw Object.assign(new Error(blocker), { status: 403 });

  const delta = startAt.getTime() - event.startAt.getTime();
  if (!delta) return { event, moved: null };
  const shift = (d) => (d ? new Date(new Date(d).getTime() + delta) : d);

  let moved = null;
  if (event.source?.kind === 'assessment') {
    const a = await Assessment.findById(linked._id).populate('subject', 'students code');
    const nextStart = shift(a.startsAt);
    if (nextStart && nextStart <= new Date())
      throw Object.assign(new Error('Choose a time in the future: students could not take the quiz'), {
        status: 400,
      });
    // Check again atomically: nobody may have started since the board was loaded.
    if (!MOVABLE_ASSESSMENT_STATES.includes(a.state) || (await Attempt.exists({ assessment: a._id })))
      throw Object.assign(new Error('The quiz has already opened'), { status: 409 });
    a.startsAt = nextStart;
    a.endsAt = shift(a.endsAt);
    await a.save();
    moved = { kind: 'assessment', id: String(a._id), title: a.title };
    await notify(app, a.subject?.students || [], {
      title: 'Quiz rescheduled',
      body: `${a.title} (${a.subject?.code}) now opens ${fmt(a.startsAt)}.`,
      href: '/assessments',
    });
  } else if (event.source?.kind === 'assignment') {
    const a = await Assignment.findById(linked._id);
    a.dueAt = shift(a.dueAt);
    await a.save();
    moved = { kind: 'assignment', id: String(a._id), title: a.title };
    const subject = await Subject.findById(a.subject).select('students code');
    await notify(app, subject?.students || [], {
      title: 'Deadline moved',
      body: `${a.title} (${subject?.code}) is now due ${fmt(a.dueAt)}.`,
      href: '/assignments',
    });
  }
  event.startAt = shift(event.startAt);
  event.endAt = shift(event.endAt);
  await event.save();
  return { event, moved };
}
