import { Assessment, Attempt, CodeRun, Grade, Question } from '../models/index.js';
import { evaluateObjective } from './grading.js';
import { toMonitor, toStudent } from './realtime.js';
import { enqueueRun, hashSource } from './code-runner.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** Records the attempt's score as the grade (keeping the best score) and tells the monitor. */
async function recordGrade(at, score) {
  const assessment = at.assessment?._id ? at.assessment : await Assessment.findById(at.assessment);
  const existing = await Grade.findOne({ assessment: assessment._id, student: at.student });
  if (!existing || existing.attempt?.equals(at._id) || score >= (existing.rawMarks ?? 0)) {
    await Grade.findOneAndUpdate(
      { assessment: assessment._id, student: at.student },
      { $set: { attempt: at._id, rawMarks: score, maxMarks: assessment.maxMarks } },
      { upsert: true, new: true },
    );
  }
  toMonitor(String(assessment._id), 'monitor:submitted', {
    attemptId: String(at._id),
    studentId: String(at.student),
    submitReason: at.submitReason,
    score,
    grading: false,
    submittedAt: at.submittedAt.toISOString(),
  });
}

const codeAnswer = (answers, questionId) => {
  const value = answers.find((a) => String(a.question) === String(questionId))?.value;
  return value && typeof value.source === 'string' && value.source.trim() && value.language ? value : null;
};

/**
 * Queues final judging of each code answer, reusing a finished "submit" run of the same code.
 * Returns the number of runs still waiting.
 */
async function queueCodeGrading(at, codeQuestions) {
  let waiting = 0;
  for (const q of codeQuestions) {
    const answer = codeAnswer(at.answers, q._id);
    if (!answer) continue;
    const base = {
      user: at.student,
      question: q._id,
      attempt: at._id,
      assessment: at.assessment._id ?? at.assessment,
      language: answer.language,
      source: answer.source,
    };
    const cached = await CodeRun.findOne({
      question: q._id,
      user: at.student,
      attempt: at._id,
      kind: 'submit',
      status: 'done',
      sourceHash: hashSource(answer.language, answer.source),
    }).sort({ createdAt: -1 });
    if (cached) {
      await CodeRun.create({
        ...base,
        kind: 'final',
        sourceHash: cached.sourceHash,
        status: 'done',
        results: cached.results,
        passedWeight: cached.passedWeight,
        totalWeight: cached.totalWeight,
        score: cached.score,
        finishedAt: new Date(),
      });
    } else {
      await enqueueRun({ ...base, kind: 'final' });
      waiting += 1;
    }
  }
  return waiting;
}

/**
 * Submits an in-progress attempt exactly once, scores it and updates the grade.
 * With several attempts the grade keeps the best score. Code answers are judged
 * asynchronously: the grade is recorded once every final run has finished.
 */
export async function finalizeAttempt(attemptId, { reason = 'MANUAL' } = {}) {
  const at = await Attempt.findOneAndUpdate(
    { _id: attemptId, state: 'IN_PROGRESS' },
    { $set: { state: 'SUBMITTED', submittedAt: new Date(), submitReason: reason } },
    { new: true },
  ).populate('assessment');
  if (!at) return Attempt.findById(attemptId);
  const questions = await Question.find({ _id: { $in: at.questionOrder } });
  const { objectiveScore } = evaluateObjective(questions, at.answers);
  const codeQuestions = questions.filter((q) => q.type === 'code');
  at.objectiveScore = objectiveScore;
  at.score = objectiveScore;
  if (!codeQuestions.length) {
    await at.save();
    await recordGrade(at, objectiveScore);
    return at;
  }
  at.gradingStatus = 'pending';
  await at.save();
  await queueCodeGrading(at, codeQuestions);
  toMonitor(String(at.assessment._id), 'monitor:submitted', {
    attemptId: String(at._id),
    studentId: String(at.student),
    submitReason: reason,
    score: null,
    grading: true,
    submittedAt: at.submittedAt.toISOString(),
  });
  // Finishes at once when every answer was cached or left blank.
  return (await completeCodeGrading(at._id)) || at;
}

/**
 * Called whenever a final run finishes. When all of an attempt's final runs are done, adds
 * the code marks to the objective score and records the grade (exactly once).
 */
export async function completeCodeGrading(attemptId) {
  const runs = await CodeRun.find({ attempt: attemptId, kind: 'final' }).select('status score question');
  if (runs.some((r) => r.status === 'queued' || r.status === 'running')) return null;
  // Latest final run per question (a regrade adds new ones).
  const byQuestion = new Map();
  for (const r of runs) byQuestion.set(String(r.question), r);
  const codeScore = round2([...byQuestion.values()].reduce((sum, r) => sum + (r.score || 0), 0));
  const current = await Attempt.findById(attemptId).select('objectiveScore');
  if (!current) return null;
  const at = await Attempt.findOneAndUpdate(
    { _id: attemptId, gradingStatus: 'pending' },
    {
      $set: {
        gradingStatus: 'done',
        codeScore,
        score: round2((current.objectiveScore || 0) + codeScore),
      },
    },
    { new: true },
  ).populate('assessment');
  if (!at) return null;
  await recordGrade(at, at.score);
  toStudent(String(at.student), 'attempt:graded', { attemptId: String(at._id), score: at.score });
  return at;
}

/** Judges a submitted attempt's code answers again (e.g. after a Judge0 outage or a test fix). */
export async function regradeCode(attemptId) {
  const at = await Attempt.findOneAndUpdate(
    { _id: attemptId, state: { $ne: 'IN_PROGRESS' } },
    { $set: { gradingStatus: 'pending' } },
    { new: true },
  ).populate('assessment');
  if (!at) return null;
  await CodeRun.deleteMany({ attempt: at._id, kind: 'final' });
  const questions = await Question.find({ _id: { $in: at.questionOrder }, type: 'code' });
  for (const q of questions) {
    const answer = codeAnswer(at.answers, q._id);
    if (answer)
      await enqueueRun({
        user: at.student,
        question: q._id,
        attempt: at._id,
        assessment: at.assessment._id,
        language: answer.language,
        source: answer.source,
        kind: 'final',
      });
  }
  return (await completeCodeGrading(at._id)) || at;
}

export async function submitExpiredAttempts(now = new Date()) {
  const expired = await Attempt.find({ state: 'IN_PROGRESS', deadlineAt: { $lte: now } })
    .select('_id assessment')
    .limit(500);
  for (const item of expired) {
    const assessment = await Assessment.findById(item.assessment).select('state');
    if (assessment?.state !== 'PAUSED') await finalizeAttempt(item._id, { reason: 'TIMEOUT' });
  }
  return expired.length;
}
