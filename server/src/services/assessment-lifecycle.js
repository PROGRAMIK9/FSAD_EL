import { Assessment, Attempt, Room } from '../models/index.js';
import { finalizeAttempt } from './attempts.js';
import { toMonitor } from './realtime.js';
export async function transitionAssessment(assessment, nextState, io) {
  const now = new Date();
  if (nextState === 'PAUSED') {
    assessment.pausedAt = now;
    const active = await Attempt.find({ assessment: assessment._id, state: 'IN_PROGRESS' });
    for (const attempt of active) {
      io?.to(`user:${attempt.student}`).emit('assessment:paused', {
        attemptId: String(attempt._id),
        remainingSeconds: Math.max(0, Math.floor((attempt.deadlineAt - now) / 1000)),
      });
    }
  }
  if (nextState === 'LIVE' && assessment.pausedAt) {
    const delta = now - assessment.pausedAt;
    const active = await Attempt.find({ assessment: assessment._id, state: 'IN_PROGRESS' });
    for (const attempt of active) {
      attempt.deadlineAt = new Date(attempt.deadlineAt.getTime() + delta);
      await attempt.save();
      io?.to(`user:${attempt.student}`).emit('assessment:resumed', {
        attemptId: String(attempt._id),
        deadlineAt: attempt.deadlineAt.toISOString(),
      });
    }
    assessment.pausedAt = undefined;
  }
  assessment.state = nextState;
  await assessment.save();
  toMonitor(String(assessment._id), 'monitor:state', { state: nextState, at: now.toISOString() });
  const roomState =
    nextState === 'PAUSED'
      ? 'PAUSED'
      : nextState === 'ENDED'
        ? 'ENDED'
        : nextState === 'LIVE'
          ? 'LIVE'
          : null;
  if (roomState) {
    const rooms = await Room.find({ assessment: assessment._id, status: { $nin: ['ENDED', 'EXPIRED'] } });
    for (const room of rooms) {
      room.status = roomState;
      await room.save();
      io?.to(`room:${room.id}`).emit(
        nextState === 'PAUSED' ? 'room:pause' : nextState === 'ENDED' ? 'room:end' : 'room:resume',
        { at: now.toISOString() },
      );
    }
  }
  if (nextState === 'ENDED') {
    const active = await Attempt.find({ assessment: assessment._id, state: 'IN_PROGRESS' }).select('_id');
    for (const attempt of active) {
      await finalizeAttempt(attempt._id, { reason: 'ASSESSMENT_ENDED' });
      io?.to(`user:${attempt.student}`).emit('assessment:ended', { attemptId: String(attempt._id) });
    }
  }
  return assessment;
}
