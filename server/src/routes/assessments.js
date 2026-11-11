import { Router } from 'express';
import { z } from 'zod';
import { authenticate, allow } from '../middleware/auth.js';
import { AcademicCalendarEvent, Assessment, Attempt, Grade, Question, Subject } from '../models/index.js';
import { audit } from '../utils/audit.js';
import { notify } from '../services/notifications.js';
import { teachesSubject, teachingSubjectIds } from '../services/access.js';
import { httpError, oid, send, wrap } from '../utils/http.js';

const router = Router();
const QUIZ_MARKS = 10;

export const proctoringSchema = z
  .object({
    enabled: z.boolean().default(true),
    requireFullscreen: z.boolean().default(true),
    maxViolations: z.coerce.number().int().min(0).max(20).default(3),
    blockClipboard: z.boolean().default(true),
    blockContextMenu: z.boolean().default(true),
    detectDuplicateTab: z.boolean().default(true),
    detectDevtools: z.boolean().default(false),
  })
  .strict();

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional(),
);

const assessmentFields = {
  subject: z.string().refine(oid, 'Invalid subject'),
  title: z.string().trim().min(3).max(160),
  description: z.string().max(4000).optional(),
  category: z.literal('Quiz').default('Quiz'),
  questionIds: z.array(z.string().refine(oid)).min(1, 'Select at least one question').max(100),
  maxMarks: z.coerce
    .number()
    .default(QUIZ_MARKS)
    .refine((v) => v === QUIZ_MARKS, 'Quiz maximum marks must be 10'),
  durationMinutes: z.coerce.number().int().positive().max(600),
  startsAt: optionalDate,
  endsAt: optionalDate,
  availabilityMode: z.enum(['scheduled', 'instant', 'room']).default('scheduled'),
  attemptsAllowed: z.coerce.number().int().min(1).max(10).default(1),
  randomizeQuestions: z.boolean().default(false),
  randomizeOptions: z.boolean().default(false),
  proctoring: proctoringSchema.default({}),
};
const createSchema = z.object({ ...assessmentFields, publish: z.boolean().default(false) });
const updateSchema = z.object(assessmentFields).partial();

/** Ensures the window and duration are coherent. */
function checkTiming({ startsAt, endsAt, durationMinutes, availabilityMode }, { publishing }) {
  if (startsAt && endsAt && endsAt <= startsAt)
    throw httpError(400, 'Closing time must be after opening time');
  if (startsAt && endsAt && durationMinutes > (endsAt - startsAt) / 60_000)
    throw httpError(400, 'Duration is longer than the time the quiz is open');
  if (publishing && availabilityMode === 'scheduled' && !startsAt)
    throw httpError(400, 'Scheduled quizzes need an opening time');
  if (publishing && endsAt && endsAt <= new Date()) throw httpError(400, 'Closing time is in the past');
}

/** Validates the selected questions: same subject, active, supported types, exactly 10 marks. */
async function checkPaper(subjectId, questionIds, maxMarks = QUIZ_MARKS) {
  const unique = [...new Set(questionIds.map(String))];
  if (unique.length !== questionIds.length) throw httpError(400, 'A question was selected twice');
  const qs = await Question.find({ _id: { $in: unique }, subject: subjectId, archivedAt: null });
  if (qs.length !== unique.length)
    throw httpError(400, 'Questions must be active and from the selected subject');
  if (qs.some((q) => !['single', 'fill_blank'].includes(q.type)))
    throw httpError(400, 'Quizzes support MCQ and single-line fill-in questions only');
  const total = Math.round(qs.reduce((n, q) => n + q.marks, 0) * 100) / 100;
  if (total !== maxMarks) throw httpError(400, `Question marks total ${total}, not ${maxMarks}`);
  return qs;
}

async function loadForTeacher(id, user) {
  if (!oid(id)) throw httpError(400, 'Invalid id');
  const a = await Assessment.findById(id).populate('subject');
  if (!a) throw httpError(404, 'Assessment not found');
  if (!teachesSubject(a.subject, user)) throw httpError(403, 'Not allocated to subject');
  return a;
}

/** Moves a draft into its live lifecycle and tells enrolled students. */
async function publish(a, req) {
  checkTiming(a, { publishing: true });
  a.state =
    a.availabilityMode === 'room' || (a.availabilityMode === 'scheduled' && a.startsAt > Date.now())
      ? 'SCHEDULED'
      : 'AVAILABLE';
  await a.save();
  if (a.startsAt)
    await AcademicCalendarEvent.create({
      title: a.title,
      description: a.description,
      subject: a.subject._id,
      startAt: a.startsAt,
      endAt: a.endsAt || new Date(a.startsAt.getTime() + a.durationMinutes * 60_000),
      type: a.category,
      createdBy: req.user._id,
    });
  await audit(req, 'ASSESSMENT_PUBLISHED', 'Assessment', a._id);
  const when = a.startsAt
    ? ` It opens ${a.startsAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`
    : '';
  await notify(req.app, a.subject.students, {
    title: 'New assessment',
    body: `${a.title} (${a.subject.code}) has been published.${when}`,
    href: '/assessments',
  });
  return a;
}

router.get(
  '/assessments',
  authenticate,
  wrap(async (req, res) => {
    const filter = {};
    if (oid(req.query.subject)) filter.subject = req.query.subject;
    if (req.user.role === 'teacher') {
      const mine = await teachingSubjectIds(req.user);
      filter.subject =
        filter.subject && mine.some((id) => id.equals(filter.subject)) ? filter.subject : { $in: mine };
    } else if (req.user.role === 'student') {
      filter.subject = { $in: await Subject.find({ students: req.user._id }).distinct('_id') };
      filter.state = { $in: ['SCHEDULED', 'AVAILABLE', 'LIVE', 'PAUSED', 'ENDED', 'COMPLETED', 'PUBLISHED'] };
    }
    const assessments = await Assessment.find(filter)
      .populate('subject', 'name code')
      .populate('creator', 'name')
      .sort({ startsAt: 1, createdAt: -1 })
      .lean();
    for (const a of assessments) {
      a.questionCount = a.questionIds?.length || 0;
      if (req.user.role === 'student') delete a.questionIds;
    }
    const ids = assessments.map((a) => a._id);
    if (req.user.role === 'student') {
      const [attempts, grades] = await Promise.all([
        Attempt.find({ assessment: { $in: ids }, student: req.user._id })
          .select('assessment state attemptNumber submitReason')
          .sort({ attemptNumber: -1 })
          .lean(),
        Grade.find({ assessment: { $in: ids }, student: req.user._id, publishedAt: { $ne: null } })
          .select('assessment rawMarks maxMarks publishedAt')
          .lean(),
      ]);
      for (const a of assessments) {
        const grade = grades.find((g) => g.assessment.equals(a._id));
        if (grade)
          a.myResult = { rawMarks: grade.rawMarks, maxMarks: grade.maxMarks, publishedAt: grade.publishedAt };
        const mine = attempts.filter((x) => x.assessment.equals(a._id));
        a.myAttempts = {
          count: mine.length,
          activeId: mine.find((x) => x.state === 'IN_PROGRESS')?._id,
          lastState: mine[0]?.state,
          lastSubmitReason: mine[0]?.submitReason,
        };
      }
    } else {
      const counts = await Attempt.aggregate([
        { $match: { assessment: { $in: ids } } },
        { $group: { _id: { a: '$assessment', s: '$state' }, n: { $sum: 1 } } },
      ]);
      for (const a of assessments) {
        const rows = counts.filter((c) => c._id.a.equals(a._id));
        a.attemptStats = {
          inProgress: rows.find((r) => r._id.s === 'IN_PROGRESS')?.n || 0,
          submitted: rows.filter((r) => r._id.s !== 'IN_PROGRESS').reduce((n, r) => n + r.n, 0),
        };
      }
    }
    send(res, assessments);
  }),
);

router.get(
  '/assessments/:id',
  authenticate,
  wrap(async (req, res) => {
    if (req.user.role === 'student') {
      if (!oid(req.params.id)) throw httpError(400, 'Invalid id');
      const a = await Assessment.findById(req.params.id)
        .select('-questionIds')
        .populate('subject', 'name code students');
      if (!a || !a.subject.students.some((id) => id.equals(req.user._id)) || a.state === 'DRAFT')
        throw httpError(404, 'Assessment not found');
      const { students: _s, ...subject } = a.subject.toObject();
      return send(res, { ...a.toObject(), subject });
    }
    const a = await loadForTeacher(req.params.id, req.user);
    await a.populate('questionIds');
    send(res, a);
  }),
);

router.post(
  '/assessments',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const { publish: publishNow, ...b } = createSchema.parse(req.body);
    checkTiming(b, { publishing: publishNow });
    const subject = await Subject.findById(b.subject);
    if (!subject) throw httpError(404, 'Subject not found');
    if (!teachesSubject(subject, req.user)) throw httpError(403, 'Not allocated to subject');
    await checkPaper(subject._id, b.questionIds, b.maxMarks);
    let a = await Assessment.create({ ...b, creator: req.user._id, state: 'DRAFT' });
    await audit(req, 'ASSESSMENT_CREATED', 'Assessment', a._id);
    if (publishNow) {
      a.subject = subject;
      a = await publish(a, req);
    }
    send(res, a, 201);
  }),
);

router.patch(
  '/assessments/:id',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const a = await loadForTeacher(req.params.id, req.user);
    if (a.state !== 'DRAFT') throw httpError(409, 'Only drafts can be edited');
    const b = updateSchema.parse(req.body);
    if (b.subject && b.subject !== String(a.subject._id)) {
      const subject = await Subject.findById(b.subject);
      if (!subject || !teachesSubject(subject, req.user)) throw httpError(403, 'Not allocated to subject');
      a.subject = subject;
      delete b.subject;
    }
    // `null`/empty clears optional dates
    for (const key of ['startsAt', 'endsAt']) if (key in req.body && !req.body[key]) a[key] = undefined;
    a.set(b);
    checkTiming(a, { publishing: false });
    await checkPaper(a.subject._id, a.questionIds.map(String), a.maxMarks);
    await a.save();
    await audit(req, 'ASSESSMENT_UPDATED', 'Assessment', a._id);
    send(res, a);
  }),
);

router.delete(
  '/assessments/:id',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const a = await loadForTeacher(req.params.id, req.user);
    if (a.state !== 'DRAFT') throw httpError(409, 'Only drafts can be deleted');
    await a.deleteOne();
    await audit(req, 'ASSESSMENT_DELETED', 'Assessment', a._id, { title: a.title });
    send(res, { deleted: true });
  }),
);

router.post(
  '/assessments/:id/publish',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const a = await loadForTeacher(req.params.id, req.user);
    if (a.state !== 'DRAFT') throw httpError(409, 'Only drafts may be published');
    send(res, await publish(a, req));
  }),
);

export default router;
