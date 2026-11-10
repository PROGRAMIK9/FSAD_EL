/**
 * Proctoring policy. Classification is a pure function so it can be unit-tested;
 * `recordViolation` applies it to an attempt and auto-submits at the limit.
 */
import { Attempt } from '../models/index.js';
import { finalizeAttempt } from './attempts.js';
import { toMonitor, toStudent } from './realtime.js';

/** Event types the client may report. */
export const EVENT_TYPES = [
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'FULLSCREEN_EXIT',
  'DUPLICATE_TAB',
  'COPY',
  'CUT',
  'PASTE',
  'CONTEXT_MENU',
  'SHORTCUT',
  'DEVTOOLS',
  'OFFLINE',
  'NAVIGATION',
];

/** Events caused by the student leaving the exam surface. Close together, they are one incident. */
const FOCUS_LOSS = new Set(['TAB_HIDDEN', 'WINDOW_BLUR', 'FULLSCREEN_EXIT']);

export const MERGE_WINDOW_MS = 1500;

export const DEFAULT_POLICY = {
  enabled: true,
  requireFullscreen: true,
  maxViolations: 3,
  blockClipboard: true,
  blockContextMenu: true,
  detectDuplicateTab: true,
  detectDevtools: false,
};

export function policyOf(assessment) {
  const raw =
    typeof assessment?.toObject === 'function' ? assessment.toObject().proctoring : assessment?.proctoring;
  const policy = { ...DEFAULT_POLICY };
  for (const key of Object.keys(DEFAULT_POLICY))
    if (raw?.[key] !== undefined && raw?.[key] !== null) policy[key] = raw[key];
  return policy;
}

/** Base severity of an event type under a policy. Only WARNING/CRITICAL count toward the limit. */
export function severityOf(type, policy) {
  switch (type) {
    case 'TAB_HIDDEN':
    case 'DUPLICATE_TAB':
      return 'CRITICAL';
    case 'FULLSCREEN_EXIT':
      return policy.requireFullscreen ? 'CRITICAL' : 'INFO';
    case 'WINDOW_BLUR':
    case 'NAVIGATION':
      return 'WARNING';
    default:
      // Clipboard, context menu and shortcuts are blocked in the browser, so attempts are
      // only logged. DevTools detection is a heuristic and never counts.
      return 'INFO';
  }
}

/**
 * Decides how one reported event is recorded.
 * `previous` is the last event that counted ({ type, occurredAt }) or undefined.
 * Returns { severity, counts, merged }.
 */
export function classifyEvent(type, policy, previous, now = new Date()) {
  if (!policy.enabled) return { severity: 'INFO', counts: false, merged: false };
  const severity = severityOf(type, policy);
  if (severity === 'INFO') return { severity, counts: false, merged: false };
  const recent = previous && now - new Date(previous.occurredAt) < MERGE_WINDOW_MS;
  const sameIncident =
    recent && (previous.type === type || (FOCUS_LOSS.has(previous.type) && FOCUS_LOSS.has(type)));
  if (sameIncident) return { severity: 'INFO', counts: false, merged: true };
  return { severity, counts: true, merged: false };
}

/** True when the attempt has used up its allowed warnings. 0 = never auto-submit. */
export const limitReached = (count, policy) =>
  policy.enabled && policy.maxViolations > 0 && count >= policy.maxViolations;

/**
 * Records an event on an attempt (populated with its assessment), notifies the teacher
 * monitor and auto-submits once the limit is reached. Returns the client response.
 */
export async function recordViolation(attempt, type, details) {
  const policy = policyOf(attempt.assessment);
  const now = new Date();
  const previous = [...attempt.proctoringEvents].reverse().find((e) => e.severity !== 'INFO');
  const { severity, counts, merged } = classifyEvent(type, policy, previous, now);
  const event = {
    type,
    occurredAt: now,
    severity,
    details: merged ? `merged with ${previous.type}` : details,
  };

  const updated = await Attempt.findOneAndUpdate(
    { _id: attempt._id, state: 'IN_PROGRESS' },
    {
      $push: { proctoringEvents: event },
      ...(counts ? { $inc: { violationCount: 1 } } : {}),
      $set: { lastSeenAt: now },
    },
    { new: true },
  );
  if (!updated)
    return {
      count: attempt.violationCount,
      max: policy.maxViolations,
      autoSubmitted: false,
      counted: false,
      inactive: true,
    };

  const count = updated.violationCount;
  const assessmentId = String(attempt.assessment._id);
  toMonitor(assessmentId, 'proctor:event', {
    attemptId: String(attempt._id),
    studentId: String(attempt.student),
    type,
    severity,
    counted: counts,
    violationCount: count,
    max: policy.maxViolations,
    at: now.toISOString(),
  });

  let autoSubmitted = false;
  if (counts && limitReached(count, policy)) {
    await finalizeAttempt(attempt._id, { reason: 'PROCTORING_LIMIT' });
    toStudent(attempt.student, 'attempt:force-submitted', {
      attemptId: String(attempt._id),
      reason: 'PROCTORING_LIMIT',
    });
    autoSubmitted = true;
  }
  return {
    count,
    max: policy.maxViolations,
    remaining: policy.maxViolations > 0 ? Math.max(0, policy.maxViolations - count) : null,
    severity,
    counted: counts,
    autoSubmitted,
  };
}
