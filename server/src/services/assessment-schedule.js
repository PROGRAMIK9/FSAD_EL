import { Assessment } from '../models/index.js';

/**
 * Moves scheduled quizzes to AVAILABLE once they open and closes any quiz past
 * its end time. Runs from the background sweep so read endpoints stay read-only.
 */
export async function advanceAssessmentStates(now = new Date()) {
  const opened = await Assessment.updateMany(
    {
      state: 'SCHEDULED',
      availabilityMode: { $ne: 'room' },
      startsAt: { $lte: now },
      $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    },
    { $set: { state: 'AVAILABLE' } },
  );
  const closed = await Assessment.updateMany(
    { state: { $in: ['SCHEDULED', 'AVAILABLE', 'LIVE', 'PAUSED'] }, endsAt: { $lte: now } },
    { $set: { state: 'ENDED' } },
  );
  return { opened: opened.modifiedCount, closed: closed.modifiedCount };
}
