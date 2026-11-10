import { Assessment, Attempt, Grade, Question } from '../models/index.js';
import { evaluateObjective } from './grading.js';
import { toMonitor } from './realtime.js';

/**
 * Submits an in-progress attempt exactly once, scores it and updates the grade.
 * With several attempts the grade keeps the best score.
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
  at.objectiveScore = objectiveScore;
  at.score = objectiveScore;
  await at.save();
  const existing = await Grade.findOne({ assessment: at.assessment._id, student: at.student });
  if (!existing || existing.attempt?.equals(at._id) || objectiveScore >= (existing.rawMarks ?? 0)) {
    await Grade.findOneAndUpdate(
      { assessment: at.assessment._id, student: at.student },
      { $set: { attempt: at._id, rawMarks: objectiveScore, maxMarks: at.assessment.maxMarks } },
      { upsert: true, new: true },
    );
  }
  toMonitor(String(at.assessment._id), 'monitor:submitted', {
    attemptId: String(at._id),
    studentId: String(at.student),
    submitReason: reason,
    score: objectiveScore,
    submittedAt: at.submittedAt.toISOString(),
  });
  return at;
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
