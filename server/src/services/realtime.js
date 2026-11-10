/**
 * Holds the Socket.IO server so services can emit without threading `io` through
 * every call. Emitting is a no-op until `setIO` runs (e.g. in tests).
 */
let io = null;

export const setIO = (server) => {
  io = server;
};

export const emitTo = (room, event, payload) => io?.to(room).emit(event, payload);

export const toStudent = (studentId, event, payload) => emitTo(`user:${studentId}`, event, payload);

export const toMonitor = (assessmentId, event, payload) => emitTo(`monitor:${assessmentId}`, event, payload);
