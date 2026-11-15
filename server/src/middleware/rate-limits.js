import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const WINDOW_MS = 15 * 60_000;
const tooMany = { ok: false, error: 'Too many requests. Please wait a moment and try again.' };

/** The verified session token of a request, or null. Invalid tokens do not count as sessions. */
function sessionToken(req) {
  const token = req.cookies?.accessToken || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return token;
  } catch {
    return null;
  }
}

/**
 * Signed-in traffic is limited per session, so a whole class behind one
 * college NAT address does not share a single budget; anonymous traffic is
 * limited per IP.
 */
export function requestKey(req) {
  const token = sessionToken(req);
  return token ? `s:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : `ip:${req.ip}`;
}

export const SESSION_LIMIT = 1500;
export const ANONYMOUS_LIMIT = 600;
export const SIGN_IN_LIMIT = 200;

export const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: (req) => (requestKey(req).startsWith('s:') ? SESSION_LIMIT : ANONYMOUS_LIMIT),
  keyGenerator: requestKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});

/** Applies only to the sign-in POSTs (Google and dev), per IP. */
export const signInLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: SIGN_IN_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});
