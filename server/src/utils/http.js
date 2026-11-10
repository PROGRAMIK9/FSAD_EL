/** Wraps an async Express handler so rejections reach the error middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Sends the standard `{ ok: true, data }` envelope. */
export const send = (res, data, status = 200) => res.status(status).json({ ok: true, data });

export const oid = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

/** Creates an Error carrying an HTTP status for the shared error handler. */
export const httpError = (status, message) => Object.assign(new Error(message), { status });
