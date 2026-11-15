import { Router } from 'express';
import { z } from 'zod';
import { authenticate, allow } from '../middleware/auth.js';
import { Assessment, Question, Subject } from '../models/index.js';
import { audit } from '../utils/audit.js';
import { teachesSubject, teachingSubjectIds } from '../services/access.js';
import { httpError, oid, send, wrap } from '../utils/http.js';

const router = Router();

const questionFields = {
  subject: z.string().refine(oid, 'Invalid subject'),
  text: z.string().trim().min(3).max(2000),
  type: z.enum(['single', 'fill_blank']),
  topic: z.string().trim().max(80).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  marks: z.coerce
    .number()
    .positive()
    .max(10)
    .refine((v) => Number.isInteger(v * 2), 'Marks must be in steps of 0.5'),
  options: z
    .array(z.object({ key: z.string().trim().min(1).max(4), text: z.string().trim().max(500) }))
    .max(8)
    .optional(),
  correctAnswer: z.unknown().optional(),
  explanation: z.string().trim().max(2000).optional(),
};

/** Type-specific rules shared by create and update. */
function checkQuestion(q) {
  if (q.type === 'single') {
    const options = q.options || [];
    if (options.length < 2) throw httpError(400, 'MCQ needs at least two options');
    if (new Set(options.map((o) => o.key)).size !== options.length)
      throw httpError(400, 'MCQ option keys must be unique');
    if (options.some((o) => !o.text.trim())) throw httpError(400, 'Every option needs text');
    if (!options.some((o) => o.key === q.correctAnswer)) throw httpError(400, 'Choose the correct option');
  } else {
    if (typeof q.correctAnswer !== 'string' || !q.correctAnswer.trim())
      throw httpError(400, 'Fill-in answer is required');
    q.correctAnswer = q.correctAnswer.trim();
    q.options = [];
  }
}

export const MAX_BATCH = 100;
const batchItem = z.object(questionFields).omit({ subject: true });

/**
 * Validates a batch of questions (for example drafts read from a scanned paper) without touching
 * the database. Returns the cleaned questions and one `{ index, error }` per rejected item.
 */
export function validateQuestionBatch(items) {
  if (!Array.isArray(items) || !items.length) throw httpError(400, 'Add at least one question');
  if (items.length > MAX_BATCH) throw httpError(400, `Import at most ${MAX_BATCH} questions at a time`);
  const questions = [];
  const errors = [];
  items.forEach((item, index) => {
    const parsed = batchItem.safeParse(item);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return errors.push({ index, error: `${where}${issue.message}` });
    }
    try {
      checkQuestion(parsed.data);
      questions.push(parsed.data);
    } catch (err) {
      errors.push({ index, error: err.message });
    }
  });
  return { questions, errors };
}

async function loadEditable(id, user) {
  if (!oid(id)) throw httpError(400, 'Invalid id');
  const q = await Question.findById(id).populate('subject', 'teachers');
  if (!q) throw httpError(404, 'Question not found');
  if (!teachesSubject(q.subject, user)) throw httpError(403, 'Not allocated to subject');
  return q;
}

router.get(
  '/questions',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const filter = req.query.archived === 'true' ? { archivedAt: { $ne: null } } : { archivedAt: null };
    const mine = await teachingSubjectIds(req.user);
    if (oid(req.query.subject)) {
      if (mine && !mine.some((id) => id.equals(req.query.subject)))
        throw httpError(403, 'Not allocated to subject');
      filter.subject = req.query.subject;
    } else if (mine) filter.subject = { $in: mine };
    if (['single', 'fill_blank'].includes(req.query.type)) filter.type = req.query.type;
    if (['easy', 'medium', 'hard'].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
    if (req.query.search) {
      const re = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ text: re }, { topic: re }];
    }
    const limit = Math.min(500, Number(req.query.limit) || 300);
    const questions = await Question.find(filter)
      .populate('creator', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    // How many non-draft quizzes use each question (those can no longer be edited).
    const usage = await Assessment.aggregate([
      { $match: { questionIds: { $in: questions.map((q) => q._id) } } },
      { $unwind: '$questionIds' },
      {
        $group: {
          _id: '$questionIds',
          total: { $sum: 1 },
          locked: { $sum: { $cond: [{ $eq: ['$state', 'DRAFT'] }, 0, 1] } },
        },
      },
    ]);
    const byId = new Map(usage.map((u) => [String(u._id), u]));
    send(
      res,
      questions.map((q) => ({
        ...q,
        usedIn: byId.get(String(q._id))?.total || 0,
        locked: (byId.get(String(q._id))?.locked || 0) > 0,
      })),
    );
  }),
);

router.post(
  '/questions',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const b = z.object(questionFields).parse(req.body);
    const subject = await Subject.findById(b.subject);
    if (!subject) throw httpError(404, 'Subject not found');
    if (!teachesSubject(subject, req.user)) throw httpError(403, 'Not allocated to subject');
    checkQuestion(b);
    const q = await Question.create({ ...b, creator: req.user._id });
    await audit(req, 'QUESTION_CREATED', 'Question', q._id);
    send(res, q, 201);
  }),
);

router.post(
  '/questions/bulk',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const { subject: subjectId, questions: items } = z
      .object({ subject: questionFields.subject, questions: z.array(z.unknown()) })
      .parse(req.body);
    const subject = await Subject.findById(subjectId);
    if (!subject) throw httpError(404, 'Subject not found');
    if (!teachesSubject(subject, req.user)) throw httpError(403, 'Not allocated to subject');
    const { questions, errors } = validateQuestionBatch(items);
    if (errors.length)
      return res.status(400).json({
        ok: false,
        error: `${errors.length} question${errors.length === 1 ? ' needs' : 's need'} fixing before import`,
        data: { errors },
      });
    const created = await Question.insertMany(
      questions.map((q) => ({ ...q, subject: subject._id, creator: req.user._id })),
      { ordered: true },
    );
    await audit(req, 'QUESTIONS_IMPORTED', 'Question', undefined, {
      count: created.length,
      subject: subject._id,
    });
    send(res, { imported: created.length }, 201);
  }),
);

router.patch(
  '/questions/:id',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const q = await loadEditable(req.params.id, req.user);
    if (await Assessment.exists({ questionIds: q._id, state: { $ne: 'DRAFT' } }))
      throw httpError(409, 'This question is used in a published quiz. Duplicate it to make changes.');
    const b = z.object(questionFields).omit({ subject: true }).partial().parse(req.body);
    const next = { type: q.type, options: q.options, correctAnswer: q.correctAnswer, ...b };
    checkQuestion(next);
    q.set({ ...b, options: next.options, correctAnswer: next.correctAnswer });
    q.depopulate('subject');
    await q.save();
    await audit(req, 'QUESTION_UPDATED', 'Question', q._id);
    send(res, q);
  }),
);

router.post(
  '/questions/:id/archive',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const q = await loadEditable(req.params.id, req.user);
    const restore = req.body?.restore === true;
    q.archivedAt = restore ? undefined : new Date();
    q.depopulate('subject');
    await q.save();
    await audit(req, restore ? 'QUESTION_RESTORED' : 'QUESTION_ARCHIVED', 'Question', q._id);
    send(res, q);
  }),
);

export default router;
