import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, allow } from '../middleware/auth.js';
import { Assessment, Attempt, Question, Room, Subject, User } from '../models/index.js';
import { audit } from '../utils/audit.js';
import { finalizeAttempt } from '../services/attempts.js';
import { EVENT_TYPES, policyOf, recordViolation } from '../services/proctoring.js';
import { toMonitor, toStudent } from '../services/realtime.js';
import { teachesSubject } from '../services/access.js';
import { httpError, oid, send, wrap } from '../utils/http.js';

const router = Router();
const STUDENT_QUESTION_FIELDS = 'text type options marks topic';

const secureShuffle = (values) => {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/** Returns the attempt's questions in paper order with per-student option order applied. */
async function paperFor(attempt) {
  const qs = await Question.find({ _id: { $in: attempt.questionOrder } })
    .select(STUDENT_QUESTION_FIELDS)
    .lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  const orders = new Map((attempt.optionOrders || []).map((o) => [String(o.question), o.keys]));
  return attempt.questionOrder
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((q) => {
      const keys = orders.get(String(q._id));
      if (!keys?.length) return q;
      const byKey = new Map(q.options.map((o) => [o.key, o]));
      return { ...q, options: keys.map((k) => byKey.get(k)).filter(Boolean) };
    });
}

const answeredCount = (answers) =>
  answers.filter((a) => a.value !== undefined && a.value !== null && String(a.value).trim() !== '').length;

/**
 * Everything the exam screen needs: the paper, saved answers, timing (with the
 * server clock so the client can correct skew), assessment state and the policy.
 */
async function examPayload(attempt, assessment) {
  const now = new Date();
  const paused = assessment.state === 'PAUSED';
  return {
    serverNow: now.toISOString(),
    assessment: {
      id: String(assessment._id),
      title: assessment.title,
      description: assessment.description,
      state: assessment.state,
      subject: assessment.subject?.code
        ? { code: assessment.subject.code, name: assessment.subject.name }
        : undefined,
      durationMinutes: assessment.durationMinutes,
      proctoring: policyOf(assessment),
      pausedAt: assessment.pausedAt,
    },
    attempt: {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      remainingSeconds: Math.max(
        0,
        Math.floor((attempt.deadlineAt - (paused && assessment.pausedAt ? assessment.pausedAt : now)) / 1000),
      ),
      state: attempt.state,
      submittedAt: attempt.submittedAt,
      submitReason: attempt.submitReason,
      violationCount: attempt.violationCount || 0,
      answers: attempt.answers.map((a) => ({
        question: a.question,
        value: a.value,
        flagged: a.flagged,
        savedAt: a.savedAt,
      })),
    },
    questions: attempt.state === 'IN_PROGRESS' ? await paperFor(attempt) : [],
  };
}

async function loadOwnAttempt(id, user) {
  if (!oid(id)) throw httpError(400, 'Invalid id');
  const at = await Attempt.findOne({ _id: id, student: user._id }).populate({
    path: 'assessment',
    populate: { path: 'subject', select: 'code name' },
  });
  if (!at) throw httpError(404, 'Attempt not found');
  return at;
}

async function loadAttemptForTeacher(id, user) {
  if (!oid(id)) throw httpError(400, 'Invalid id');
  const at = await Attempt.findById(id).populate({ path: 'assessment', populate: { path: 'subject' } });
  if (!at) throw httpError(404, 'Attempt not found');
  if (!teachesSubject(at.assessment.subject, user)) throw httpError(403, 'Not authorized');
  return at;
}

async function loadAssessmentForTeacher(id, user) {
  if (!oid(id)) throw httpError(400, 'Invalid id');
  const a = await Assessment.findById(id).populate('subject');
  if (!a) throw httpError(404, 'Assessment not found');
  if (!teachesSubject(a.subject, user)) throw httpError(403, 'Not allocated to subject');
  return a;
}

/** Starts a new attempt, or resumes the one in progress. */
router.post(
  '/assessments/:id/start',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    const { roomId } = z.object({ roomId: z.string().refine(oid).optional() }).parse(req.body || {});
    if (!oid(req.params.id)) throw httpError(400, 'Invalid id');
    const a = await Assessment.findById(req.params.id).populate('subject', 'code name students');
    if (!a) throw httpError(404, 'Assessment not found');
    if (!a.subject.students.some((id) => id.equals(req.user._id)))
      throw httpError(403, 'Not enrolled in this subject');
    const now = new Date();

    const active = await Attempt.findOne({ assessment: a._id, student: req.user._id, state: 'IN_PROGRESS' });
    if (active) {
      active.lastSeenAt = now;
      await active.save();
      toMonitor(String(a._id), 'monitor:attempt-started', {
        attemptId: active.id,
        studentId: req.user.id,
        resumed: true,
      });
      return send(res, await examPayload(active, a));
    }

    if (a.availabilityMode === 'room') {
      const room = roomId
        ? await Room.findOne({
            _id: roomId,
            assessment: a._id,
            status: 'LIVE',
            expiresAt: { $gt: now },
            participants: req.user._id,
          })
        : null;
      if (!room) throw httpError(403, 'Join the active examination room first');
    }
    if (
      a.state === 'SCHEDULED' &&
      a.availabilityMode !== 'room' &&
      a.startsAt &&
      a.startsAt <= now &&
      (!a.endsAt || a.endsAt >= now)
    ) {
      a.state = 'AVAILABLE';
      await a.save();
    }
    if (
      !['AVAILABLE', 'LIVE'].includes(a.state) ||
      (a.startsAt && a.startsAt > now) ||
      (a.endsAt && a.endsAt < now)
    )
      throw httpError(
        409,
        a.state === 'PAUSED' ? 'The quiz is paused by your teacher' : 'Assessment is not available',
      );

    const count = await Attempt.countDocuments({ assessment: a._id, student: req.user._id });
    if (count >= a.attemptsAllowed) throw httpError(409, 'Attempt limit reached');
    const ids = a.randomizeQuestions ? secureShuffle(a.questionIds) : [...a.questionIds];
    const paper = await Question.find({ _id: { $in: ids } }).select('options');
    const optionOrders = a.randomizeOptions
      ? paper
          .filter((q) => q.options?.length)
          .map((q) => ({ question: q._id, keys: secureShuffle(q.options.map((o) => o.key)) }))
      : [];
    const deadlineAt = new Date(now.getTime() + a.durationMinutes * 60_000);
    if (a.endsAt && a.endsAt < deadlineAt) deadlineAt.setTime(a.endsAt.getTime());
    let at;
    try {
      at = await Attempt.create({
        assessment: a._id,
        student: req.user._id,
        attemptNumber: count + 1,
        questionOrder: ids,
        optionOrders,
        startedAt: now,
        deadlineAt,
        lastSeenAt: now,
      });
    } catch (err) {
      if (err.code === 11000) throw httpError(409, 'An attempt was already started; refresh to recover it');
      throw err;
    }
    toMonitor(String(a._id), 'monitor:attempt-started', {
      attemptId: at.id,
      studentId: req.user.id,
      name: req.user.name,
      usn: req.user.usn,
      startedAt: at.startedAt,
      deadlineAt: at.deadlineAt,
      total: ids.length,
    });
    send(res, await examPayload(at, a), 201);
  }),
);

router.get(
  '/attempts/:id',
  authenticate,
  wrap(async (req, res) => {
    if (req.user.role === 'student') {
      const at = await loadOwnAttempt(req.params.id, req.user);
      return send(res, await examPayload(at, at.assessment));
    }
    const at = await loadAttemptForTeacher(req.params.id, req.user);
    await at.populate('student', 'name usn email');
    const questions = await Question.find({ _id: { $in: at.questionOrder } }).lean();
    const byId = new Map(questions.map((q) => [String(q._id), q]));
    send(res, {
      attempt: at,
      student: at.student,
      questions: at.questionOrder.map((id) => byId.get(String(id))).filter(Boolean),
      policy: policyOf(at.assessment),
    });
  }),
);

router.patch(
  '/attempts/:id/answers',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    const b = z
      .object({ question: z.string().refine(oid), value: z.unknown(), flagged: z.boolean().optional() })
      .parse(req.body);
    const at = await loadOwnAttempt(req.params.id, req.user);
    if (at.state !== 'IN_PROGRESS') throw httpError(409, 'Attempt is not active');
    if (at.assessment.state === 'PAUSED') throw httpError(409, 'Assessment is paused');
    if (at.assessment.state === 'ENDED') throw httpError(409, 'Assessment has ended');
    if (new Date() >= at.deadlineAt) throw httpError(409, 'Attempt deadline passed');
    if (!at.questionOrder.some((q) => q.equals(b.question)))
      throw httpError(400, 'Question is not in this paper');
    if (typeof b.value === 'string' && b.value.length > 500) throw httpError(400, 'Answer is too long');
    const now = new Date();
    const old = at.answers.find((x) => x.question.equals(b.question));
    if (old) {
      if (b.value !== undefined) old.value = b.value;
      old.savedAt = now;
      if (b.flagged !== undefined) old.flagged = b.flagged;
    } else
      at.answers.push({ question: b.question, value: b.value, savedAt: now, flagged: b.flagged || false });
    at.lastSeenAt = now;
    await at.save();
    toMonitor(String(at.assessment._id), 'monitor:progress', {
      attemptId: at.id,
      answered: answeredCount(at.answers),
      total: at.questionOrder.length,
      at: now.toISOString(),
    });
    send(res, { savedAt: now });
  }),
);

router.post(
  '/attempts/:id/proctoring-events',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    const b = z
      .object({ type: z.enum(EVENT_TYPES), details: z.string().max(200).optional() })
      .parse(req.body);
    const at = await loadOwnAttempt(req.params.id, req.user);
    if (at.state !== 'IN_PROGRESS') throw httpError(409, 'Attempt is not active');
    send(res, await recordViolation(at, b.type, b.details));
  }),
);

router.post(
  '/attempts/:id/submit',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    const attempt = await loadOwnAttempt(req.params.id, req.user);
    if (attempt.state !== 'IN_PROGRESS')
      return send(res, {
        state: attempt.state,
        submittedAt: attempt.submittedAt,
        submitReason: attempt.submitReason,
      });
    if (attempt.assessment.state === 'PAUSED') throw httpError(409, 'Assessment is paused');
    const reason = Date.now() >= attempt.deadlineAt.getTime() ? 'TIMEOUT' : 'MANUAL';
    const at = await finalizeAttempt(attempt._id, { reason });
    send(res, { state: at.state, submittedAt: at.submittedAt, submitReason: at.submitReason });
  }),
);

router.post(
  '/attempts/:id/extend',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const { minutes } = z.object({ minutes: z.coerce.number().int().min(1).max(240) }).parse(req.body);
    const at = await loadAttemptForTeacher(req.params.id, req.user);
    if (at.state !== 'IN_PROGRESS') throw httpError(409, 'Attempt is not active');
    at.deadlineAt = new Date(Math.max(Date.now(), at.deadlineAt.getTime()) + minutes * 60_000);
    await at.save();
    await audit(req, 'ATTEMPT_TIME_EXTENDED', 'Attempt', at._id, { minutes });
    const payload = { attemptId: at.id, deadlineAt: at.deadlineAt.toISOString(), minutes };
    toStudent(at.student, 'attempt:extended', payload);
    toMonitor(String(at.assessment._id), 'monitor:extended', payload);
    send(res, { deadlineAt: at.deadlineAt });
  }),
);

router.post(
  '/attempts/:id/force-submit',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body || {});
    const at = await loadAttemptForTeacher(req.params.id, req.user);
    if (at.state !== 'IN_PROGRESS') throw httpError(409, 'Attempt is not active');
    const done = await finalizeAttempt(at._id, { reason: 'TEACHER' });
    await audit(req, 'ATTEMPT_FORCE_SUBMITTED', 'Attempt', at._id, { reason });
    toStudent(at.student, 'attempt:force-submitted', {
      attemptId: at.id,
      reason: 'TEACHER',
      message: reason,
    });
    send(res, { state: done.state, submittedAt: done.submittedAt });
  }),
);

router.post(
  '/attempts/:id/message',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const { message } = z.object({ message: z.string().trim().min(2).max(300) }).parse(req.body);
    const at = await loadAttemptForTeacher(req.params.id, req.user);
    if (at.state !== 'IN_PROGRESS') throw httpError(409, 'Attempt is not active');
    toStudent(at.student, 'attempt:message', {
      attemptId: at.id,
      message,
      from: req.user.name,
      at: new Date().toISOString(),
    });
    await audit(req, 'ATTEMPT_MESSAGE_SENT', 'Attempt', at._id, { message });
    send(res, { sent: true });
  }),
);

router.get(
  '/assessments/:id/attempts',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const a = await loadAssessmentForTeacher(req.params.id, req.user);
    const filter = { assessment: a._id };
    if (req.query.state) filter.state = req.query.state;
    send(
      res,
      await Attempt.find(filter)
        .populate('student', 'name usn email')
        .populate('questionOrder', 'text type marks')
        .sort({ startedAt: 1 }),
    );
  }),
);

/**
 * Live monitor snapshot: every enrolled student with their latest attempt, plus
 * recent proctoring events. Updates then arrive over the `monitor:<id>` socket room.
 */
router.get(
  '/assessments/:id/monitor',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const a = await loadAssessmentForTeacher(req.params.id, req.user);
    const [students, attempts] = await Promise.all([
      User.find({ _id: { $in: a.subject.students }, role: 'student' })
        .select('name usn email')
        .sort({ name: 1 })
        .lean(),
      Attempt.find({ assessment: a._id }).select('-optionOrders').sort({ attemptNumber: -1 }).lean(),
    ]);
    const latest = new Map();
    for (const at of attempts) if (!latest.has(String(at.student))) latest.set(String(at.student), at);
    const roster = students.map((s) => {
      const at = latest.get(String(s._id));
      return {
        student: s,
        attempt: at && {
          id: String(at._id),
          attemptNumber: at.attemptNumber,
          state: at.state,
          startedAt: at.startedAt,
          deadlineAt: at.deadlineAt,
          submittedAt: at.submittedAt,
          submitReason: at.submitReason,
          score: at.score,
          answered: answeredCount(at.answers || []),
          total: at.questionOrder.length,
          violationCount: at.violationCount || 0,
          lastSeenAt: at.lastSeenAt,
          events: (at.proctoringEvents || []).slice(-50),
        },
      };
    });
    const events = attempts
      .flatMap((at) =>
        (at.proctoringEvents || []).map((e) => ({
          ...e,
          attemptId: String(at._id),
          studentId: String(at.student),
        })),
      )
      .sort((x, y) => new Date(y.occurredAt) - new Date(x.occurredAt))
      .slice(0, 200);
    send(res, {
      serverNow: new Date().toISOString(),
      assessment: {
        id: String(a._id),
        title: a.title,
        state: a.state,
        subject: { code: a.subject.code, name: a.subject.name },
        durationMinutes: a.durationMinutes,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        availabilityMode: a.availabilityMode,
        questionCount: a.questionIds.length,
        proctoring: policyOf(a),
      },
      roster,
      events,
    });
  }),
);

/** Lets the monitor confirm a teacher may join `monitor:<id>`. Used by the socket handler. */
export async function canMonitor(user, assessmentId) {
  if (!oid(assessmentId) || !['teacher', 'admin'].includes(user.role)) return false;
  const a = await Assessment.findById(assessmentId).select('subject');
  if (!a) return false;
  if (user.role === 'admin') return true;
  return Boolean(await Subject.exists({ _id: a.subject, teachers: user._id }));
}

export default router;
