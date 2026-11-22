import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, allow } from '../middleware/auth.js';
import { requestKey } from '../middleware/rate-limits.js';
import { Attempt, CodeRun, Question, Subject } from '../models/index.js';
import { teachesSubject, teachingSubjectIds } from '../services/access.js';
import { regradeCode } from '../services/attempts.js';
import { enqueueRun, executionEnabled } from '../services/code-runner.js';
import { publicRunResults } from '../services/grading.js';
import { LANGUAGES, LANGUAGE_KEYS } from '../services/judge0.js';
import { audit } from '../utils/audit.js';
import { httpError, oid, send, wrap } from '../utils/http.js';

const router = Router();
const MAX_SOURCE = 64 * 1024;
const MAX_STDIN = 64 * 1024;

/** Characters of a sample test shown to students (Run still uses the whole test). */
const SAMPLE_SHOWN = 16 * 1024;

/** The parts of a coding question a student may see: never the hidden tests or the drivers. */
export function studentCodeView(code) {
  if (!code) return null;
  const starter = code.starter instanceof Map ? Object.fromEntries(code.starter) : code.starter || {};
  const tests = code.testCases || [];
  const clip = (s = '') =>
    s.length > SAMPLE_SHOWN
      ? `${s.slice(0, SAMPLE_SHOWN)}\n… (${s.length - SAMPLE_SHOWN} more characters)`
      : s;
  return {
    languages: code.languages?.length ? code.languages : LANGUAGE_KEYS,
    mode: code.mode || 'stdio',
    signature: code.mode === 'function' ? code.signature : undefined,
    starter,
    timeLimitMs: code.timeLimitMs,
    memoryLimitMb: code.memoryLimitMb,
    samples: tests
      .map((t, index) => ({ index, input: t.input, expectedOutput: t.expectedOutput, hidden: t.hidden }))
      .filter((t) => !t.hidden)
      .map(({ index, input, expectedOutput }) => ({
        index,
        input: clip(input),
        expectedOutput: clip(expectedOutput),
      })),
    hiddenCount: tests.filter((t) => t.hidden).length,
  };
}

/** Runs per session in a 5 minute window, on top of one run at a time per user. */
export const CODE_RUN_LIMIT = 30;
const codeRunLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: CODE_RUN_LIMIT,
  keyGenerator: requestKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'You are running code too often. Please wait a minute.' },
});

const runBody = z.object({
  questionId: z.string().refine(oid, 'Invalid question').optional(),
  attemptId: z.string().refine(oid, 'Invalid attempt').optional(),
  language: z.enum(LANGUAGE_KEYS),
  source: z.string().min(1, 'Write some code first').max(MAX_SOURCE, 'Code is too long'),
  stdin: z.string().max(MAX_STDIN, 'Input is too long').optional(),
});

/** Checks who may run what, and returns the fields of the run to queue. */
async function authorizeRun(b, user, submit) {
  if (!b.questionId) {
    if (submit) throw httpError(400, 'Choose a question to submit');
    if (b.attemptId) throw httpError(400, 'Choose a question');
    return { kind: 'scratch', stdin: b.stdin ?? '' };
  }
  const question = await Question.findById(b.questionId).populate('subject', 'teachers students');
  if (!question || question.type !== 'code') throw httpError(404, 'Coding question not found');
  const allowed = question.code?.languages?.length ? question.code.languages : LANGUAGE_KEYS;
  if (!allowed.includes(b.language)) throw httpError(400, 'Language is not allowed for this question');
  const fields = { question: question._id, stdin: submit ? undefined : b.stdin };

  if (user.role !== 'student') {
    if (!teachesSubject(question.subject, user)) throw httpError(403, 'Not allocated to subject');
    // Teachers validate reference solutions against every test.
    return { ...fields, kind: submit ? 'submit' : 'run' };
  }
  if (b.attemptId) {
    const at = await Attempt.findOne({ _id: b.attemptId, student: user._id }).populate('assessment', 'state');
    if (!at) throw httpError(404, 'Attempt not found');
    if (at.state !== 'IN_PROGRESS' || new Date() >= at.deadlineAt)
      throw httpError(409, 'Attempt is not active');
    if (at.assessment?.state === 'PAUSED') throw httpError(409, 'Assessment is paused');
    if (!at.questionOrder.some((id) => id.equals(question._id)))
      throw httpError(400, 'Question is not in this paper');
    return { ...fields, attempt: at._id, assessment: at.assessment._id, kind: submit ? 'submit' : 'run' };
  }
  const enrolled = question.subject?.students?.some((id) => id.equals(user._id));
  if (!question.code?.practice || question.archivedAt || !enrolled)
    throw httpError(404, 'Coding question not found');
  return { ...fields, kind: submit ? 'submit' : 'run' };
}

function runHandler(submit) {
  return wrap(async (req, res) => {
    if (!executionEnabled()) throw httpError(503, 'Code execution is not available right now');
    const b = runBody.parse(req.body);
    const fields = await authorizeRun(b, req.user, submit);
    const busy = await CodeRun.exists({
      user: req.user._id,
      status: { $in: ['queued', 'running'] },
      kind: { $ne: 'final' },
    });
    if (busy) throw httpError(429, 'Your previous run is still going. Wait for it to finish.');
    const run = await enqueueRun({
      ...fields,
      user: req.user._id,
      language: b.language,
      source: b.source,
    });
    send(res, { runId: String(run._id), status: run.status, kind: run.kind }, 202);
  });
}

router.get('/code/languages', authenticate, (_req, res) =>
  send(res, {
    enabled: executionEnabled(),
    languages: LANGUAGE_KEYS.map((key) => ({ key, label: LANGUAGES[key].label })),
  }),
);
router.post('/code/run', authenticate, codeRunLimiter, runHandler(false));
router.post('/code/submit', authenticate, codeRunLimiter, runHandler(true));

router.get(
  '/code/runs/:id',
  authenticate,
  wrap(async (req, res) => {
    if (!oid(req.params.id)) throw httpError(400, 'Invalid id');
    const run = await CodeRun.findById(req.params.id).select('-source').lean();
    if (!run) throw httpError(404, 'Run not found');
    let staff = false;
    if (!run.user.equals(req.user._id)) {
      if (req.user.role === 'student') throw httpError(404, 'Run not found');
      const q = run.question && (await Question.findById(run.question).populate('subject', 'teachers'));
      if (!q || !teachesSubject(q.subject, req.user)) throw httpError(403, 'Not authorized');
      staff = true;
    }
    staff ||= req.user.role !== 'student';
    const scored = run.kind !== 'run' && run.kind !== 'scratch';
    const queuedAhead =
      run.status === 'queued'
        ? await CodeRun.countDocuments({ status: 'queued', createdAt: { $lt: run.createdAt } })
        : 0;
    send(res, {
      id: String(run._id),
      kind: run.kind,
      language: run.language,
      status: run.status,
      queuedAhead,
      error:
        run.status === 'error'
          ? 'The code judge could not complete this run. Check the server logs (code runner or Judge0), then try again.'
          : undefined,
      results: publicRunResults(run.results, { showHidden: staff }),
      passedWeight: run.passedWeight,
      totalWeight: run.totalWeight,
      score: scored ? run.score : undefined,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    });
  }),
);

/** Re-judges a submitted attempt's code answers. */
router.post(
  '/attempts/:id/regrade-code',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    if (!oid(req.params.id)) throw httpError(400, 'Invalid id');
    const at = await Attempt.findById(req.params.id).populate({
      path: 'assessment',
      populate: { path: 'subject', select: 'teachers' },
    });
    if (!at) throw httpError(404, 'Attempt not found');
    if (!teachesSubject(at.assessment.subject, req.user)) throw httpError(403, 'Not authorized');
    if (at.state === 'IN_PROGRESS') throw httpError(409, 'Attempt is still in progress');
    const out = await regradeCode(at._id);
    await audit(req, 'ATTEMPT_CODE_REGRADED', 'Attempt', at._id);
    send(res, { gradingStatus: out?.gradingStatus, score: out?.score });
  }),
);

/** Coding problems open for practice in the caller's subjects. */
router.get(
  '/practice/questions',
  authenticate,
  wrap(async (req, res) => {
    const filter = { type: 'code', 'code.practice': true, archivedAt: null };
    if (req.user.role === 'student')
      filter.subject = { $in: await Subject.find({ students: req.user._id }).distinct('_id') };
    else {
      const mine = await teachingSubjectIds(req.user);
      if (mine) filter.subject = { $in: mine };
    }
    if (oid(req.query.subject)) filter.subject = { $in: [req.query.subject] };
    const questions = await Question.find(filter)
      .select('text topic difficulty marks subject code.languages createdAt')
      .populate('subject', 'code name')
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();
    if (req.user.role === 'student' && oid(req.query.subject)) {
      const enrolled = await Subject.exists({ _id: req.query.subject, students: req.user._id });
      if (!enrolled) return send(res, []);
    }
    const solved = await CodeRun.aggregate([
      {
        $match: {
          user: req.user._id,
          kind: 'submit',
          status: 'done',
          attempt: null,
          question: { $in: questions.map((q) => q._id) },
        },
      },
      {
        $group: {
          _id: '$question',
          best: {
            $max: {
              $cond: [{ $gt: ['$totalWeight', 0] }, { $divide: ['$passedWeight', '$totalWeight'] }, 0],
            },
          },
          tries: { $sum: 1 },
        },
      },
    ]);
    const byQ = new Map(solved.map((s) => [String(s._id), s]));
    send(
      res,
      questions.map((q) => ({
        id: String(q._id),
        title: q.text
          .split('\n')[0]
          .replace(/^#+\s*/, '')
          .slice(0, 120),
        topic: q.topic,
        difficulty: q.difficulty,
        subject: q.subject,
        languages: q.code?.languages,
        best: byQ.get(String(q._id))?.best ?? null,
        tries: byQ.get(String(q._id))?.tries ?? 0,
      })),
    );
  }),
);

router.get(
  '/practice/questions/:id',
  authenticate,
  wrap(async (req, res) => {
    if (!oid(req.params.id)) throw httpError(400, 'Invalid id');
    const q = await Question.findOne({ _id: req.params.id, type: 'code', archivedAt: null })
      .populate('subject', 'code name teachers students')
      .lean();
    const visible =
      q &&
      (req.user.role === 'student'
        ? q.code?.practice && q.subject?.students?.some((id) => id.equals(req.user._id))
        : teachesSubject(q.subject, req.user));
    if (!visible) throw httpError(404, 'Coding question not found');
    const last = await CodeRun.findOne({
      user: req.user._id,
      question: q._id,
      attempt: null,
      kind: { $in: ['run', 'submit'] },
    })
      .sort({ createdAt: -1 })
      .select('language source')
      .lean();
    send(res, {
      id: String(q._id),
      text: q.text,
      topic: q.topic,
      difficulty: q.difficulty,
      marks: q.marks,
      subject: { code: q.subject.code, name: q.subject.name },
      code: studentCodeView(q.code),
      lastCode: last ? { language: last.language, source: last.source } : null,
    });
  }),
);

export default router;
