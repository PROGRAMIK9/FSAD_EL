import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvent, limitReached, policyOf, severityOf, DEFAULT_POLICY, MERGE_WINDOW_MS } from '../src/services/proctoring.js';

const policy = { ...DEFAULT_POLICY };
const at = (ms) => new Date(Date.UTC(2026, 10, 10, 10, 0, 0) + ms);

test('focus-loss events count as warnings', () => {
  for (const type of ['TAB_HIDDEN', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'DUPLICATE_TAB']) {
    const r = classifyEvent(type, policy, undefined, at(0));
    assert.equal(r.counts, true, type);
    assert.notEqual(r.severity, 'INFO', type);
  }
});

test('blocked actions and heuristics are logged but never counted', () => {
  for (const type of ['COPY', 'CUT', 'PASTE', 'CONTEXT_MENU', 'SHORTCUT', 'DEVTOOLS', 'OFFLINE']) {
    const r = classifyEvent(type, policy, undefined, at(0));
    assert.deepEqual(r, { severity: 'INFO', counts: false, merged: false }, type);
  }
});

test('one tab switch that fires blur, visibility and fullscreen exit counts once', () => {
  const first = classifyEvent('WINDOW_BLUR', policy, undefined, at(0));
  assert.equal(first.counts, true);
  const previous = { type: 'WINDOW_BLUR', occurredAt: at(0) };
  assert.equal(classifyEvent('TAB_HIDDEN', policy, previous, at(120)).merged, true);
  assert.equal(classifyEvent('FULLSCREEN_EXIT', policy, previous, at(400)).counts, false);
});

test('a repeat after the merge window counts again', () => {
  const previous = { type: 'TAB_HIDDEN', occurredAt: at(0) };
  assert.equal(classifyEvent('TAB_HIDDEN', policy, previous, at(MERGE_WINDOW_MS + 1)).counts, true);
});

test('a different kind of incident inside the window still counts', () => {
  const previous = { type: 'TAB_HIDDEN', occurredAt: at(0) };
  assert.equal(classifyEvent('DUPLICATE_TAB', policy, previous, at(200)).counts, true);
});

test('fullscreen exit is informational when fullscreen is not required', () => {
  assert.equal(severityOf('FULLSCREEN_EXIT', { ...policy, requireFullscreen: false }), 'INFO');
  assert.equal(classifyEvent('FULLSCREEN_EXIT', { ...policy, requireFullscreen: false }).counts, false);
});

test('nothing counts when proctoring is disabled', () => {
  assert.equal(classifyEvent('TAB_HIDDEN', { ...policy, enabled: false }).counts, false);
});

test('limit is reached at maxViolations and never when it is 0', () => {
  assert.equal(limitReached(2, { ...policy, maxViolations: 3 }), false);
  assert.equal(limitReached(3, { ...policy, maxViolations: 3 }), true);
  assert.equal(limitReached(50, { ...policy, maxViolations: 0 }), false);
  assert.equal(limitReached(5, { ...policy, enabled: false }), false);
});

test('policyOf fills defaults and keeps explicit values, including false and 0', () => {
  assert.deepEqual(policyOf(undefined), DEFAULT_POLICY);
  const p = policyOf({ proctoring: { maxViolations: 0, requireFullscreen: false } });
  assert.equal(p.maxViolations, 0);
  assert.equal(p.requireFullscreen, false);
  assert.equal(p.blockClipboard, true);
  const fromDoc = policyOf({ toObject: () => ({ proctoring: { detectDevtools: true } }) });
  assert.equal(fromDoc.detectDevtools, true);
});
