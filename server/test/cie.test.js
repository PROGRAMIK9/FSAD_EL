import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCie } from '../src/services/cie.js';

test('CIE follows the scheme: quizzes 20 + tests reduced to 40 + EL 40', () => {
  const r = computeCie({ quiz1: 8, quiz2: 7, test1: 40, test2: 35, el1: 18, el2: 16 });
  assert.equal(r.quizzes, 15);
  assert.equal(r.tests, 30); // (40 + 35) / 100 * 40
  assert.equal(r.el, 34);
  assert.equal(r.total, 79);
  assert.equal(r.quizAndTests, 45);
  assert.equal(r.eligible, true);
  assert.deepEqual(r.missing, []);
});

test('eligibility needs 30 of 60 in quizzes and tests combined', () => {
  assert.equal(computeCie({ quiz1: 5, quiz2: 5, test1: 25, test2: 25, el1: 20, el2: 20 }).eligible, true); // 10 + 20
  assert.equal(computeCie({ quiz1: 4, quiz2: 5, test1: 25, test2: 25, el1: 20, el2: 20 }).eligible, false); // 9 + 20
});

test('missing components leave totals open and are listed', () => {
  const r = computeCie({ quiz1: 9, test1: 30 });
  assert.equal(r.quizzes, null);
  assert.equal(r.total, null);
  assert.equal(r.eligible, null);
  assert.deepEqual(r.missing, ['quiz2', 'test2', 'el1', 'el2']);
});

test('integrated-lab courses add a 50-mark lab component', () => {
  const r = computeCie(
    { quiz1: 10, quiz2: 10, test1: 50, test2: 50, el1: 20, el2: 20, labRecord: 36, labTest: 9 },
    { hasLab: true },
  );
  assert.equal(r.total, 100);
  assert.equal(r.lab, 45);
  assert.deepEqual(computeCie({ labRecord: 30 }, { hasLab: true }).missing.includes('labTest'), true);
});

test('fractional test marks are reduced to one decimal place', () => {
  assert.equal(computeCie({ test1: 33, test2: 21 }).tests, 21.6);
});
