import jwt from 'jsonwebtoken';
import { User, Room, Assessment, Attempt } from '../models/index.js';
import { canMonitor } from '../routes/attempts.js';
import { toMonitor } from '../services/realtime.js';
import { transitionAssessment } from '../services/assessment-lifecycle.js';

const isObjectId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

function readToken(socket) {
  return (
    socket.handshake.auth?.token ||
    socket.handshake.headers.cookie
      ?.split('; ')
      .find((c) => c.startsWith('accessToken='))
      ?.slice(12)
  );
}

export async function authenticateSocket(socket, next) {
  try {
    const token = readToken(socket);
    if (!token) throw new Error('Authentication required');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive || user.approvalStatus !== 'approved') throw new Error('Account unavailable');
    socket.user = user;
    next();
  } catch (e) {
    next(new Error(e.message));
  }
}

/**
 * Wraps a socket handler so that thrown errors (bad ids, DB failures) are reported
 * to the client as `room:error` instead of becoming unhandled rejections.
 */
const guarded = (socket, handler) => async (payload) => {
  try {
    await handler(payload ?? {});
  } catch (err) {
    console.error('Socket handler failed:', err.message);
    socket.emit('room:error', { message: 'Request could not be completed' });
  }
};

async function ownedRoom(socket, roomId) {
  if (!isObjectId(roomId)) return null;
  const room = await Room.findById(roomId);
  if (!room || socket.user.role !== 'teacher' || !room.teacher.equals(socket.user._id)) return null;
  return room;
}

export function registerSocketHandlers(io) {
  io.use(authenticateSocket);
  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);

    // Teachers subscribe to live events for one assessment.
    socket.on('monitor:join', async ({ assessmentId } = {}, ack) => {
      try {
        const ok = await canMonitor(socket.user, assessmentId);
        if (ok) socket.join(`monitor:${assessmentId}`);
        ack?.({ ok });
      } catch {
        ack?.({ ok: false });
      }
    });
    socket.on('monitor:leave', ({ assessmentId } = {}) => socket.leave(`monitor:${assessmentId}`));

    // Students heartbeat while an attempt is open so teachers can see who is connected.
    socket.on('attempt:heartbeat', async ({ attemptId } = {}) => {
      try {
        if (!isObjectId(attemptId) || socket.user.role !== 'student') return;
        const now = new Date();
        const at = await Attempt.findOneAndUpdate(
          { _id: attemptId, student: socket.user._id, state: 'IN_PROGRESS' },
          { $set: { lastSeenAt: now } },
          { new: true },
        ).select('assessment');
        if (!at) return;
        socket.data.attempt = { id: attemptId, assessment: String(at.assessment) };
        toMonitor(String(at.assessment), 'monitor:presence', {
          attemptId,
          online: true,
          at: now.toISOString(),
        });
      } catch {
        /* heartbeat failures are not user-visible */
      }
    });
    socket.on('disconnect', () => {
      const current = socket.data.attempt;
      if (current)
        toMonitor(current.assessment, 'monitor:presence', {
          attemptId: current.id,
          online: false,
          at: new Date().toISOString(),
        });
    });

    socket.on(
      'room:join',
      guarded(socket, async ({ roomId }) => {
        if (!isObjectId(roomId)) return socket.emit('room:error', { message: 'Room unavailable' });
        const room = await Room.findById(roomId);
        if (!room || room.expiresAt < Date.now())
          return socket.emit('room:error', { message: 'Room unavailable' });
        const isTeacher = socket.user.role === 'teacher';
        const allowed = isTeacher
          ? room.teacher.equals(socket.user._id)
          : room.eligibleStudents.some((id) => id.equals(socket.user._id)) &&
            room.participants.some((id) => id.equals(socket.user._id));
        if (!allowed) return socket.emit('room:error', { message: 'Not authorized' });
        socket.join(`room:${room.id}`);
        if (!isTeacher)
          socket.to(`room:${room.id}`).emit('room:participant-joined', {
            userId: socket.user.id,
            name: socket.user.name,
            usn: socket.user.usn,
          });
      }),
    );

    socket.on(
      'room:start',
      guarded(socket, async ({ roomId }) => {
        const room = await ownedRoom(socket, roomId);
        if (!room || room.status !== 'WAITING')
          return socket.emit('room:error', { message: 'Not authorized or room already started' });
        const assessment = await Assessment.findById(room.assessment);
        if (
          !assessment ||
          (assessment.startsAt && assessment.startsAt > Date.now()) ||
          (assessment.endsAt && assessment.endsAt < Date.now())
        )
          return socket.emit('room:error', { message: 'Assessment is outside its scheduled window' });
        room.status = 'LIVE';
        await room.save();
        assessment.state = 'LIVE';
        await assessment.save();
        io.to(`room:${room.id}`).emit('room:start', { startedAt: new Date().toISOString() });
      }),
    );

    for (const [event, requiredStates, nextState, error] of [
      ['room:pause', ['LIVE'], 'PAUSED', 'Assessment is not live'],
      ['room:resume', ['PAUSED'], 'LIVE', 'Assessment is not paused'],
      ['room:end', ['LIVE', 'PAUSED', 'AVAILABLE'], 'ENDED', 'Assessment is already ended'],
    ]) {
      socket.on(
        event,
        guarded(socket, async ({ roomId }) => {
          const room = await ownedRoom(socket, roomId);
          if (!room) return socket.emit('room:error', { message: 'Not authorized' });
          const assessment = await Assessment.findById(room.assessment);
          if (!assessment || !requiredStates.includes(assessment.state))
            return socket.emit('room:error', { message: error });
          await transitionAssessment(assessment, nextState, io);
        }),
      );
    }
  });
}
