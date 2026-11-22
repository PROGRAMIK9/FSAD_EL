import test from 'node:test';
import assert from 'node:assert/strict';
import { moveBlocker } from '../src/services/calendar.js';

const teacher = { role: 'teacher', _id: 't' };
const admin = { role: 'admin', _id: 'a' };
const student = { role: 'student', _id: 's' };
const event = (fields = {}) => ({ subject: 'sub1', startAt: new Date(), ...fields });

test('who may move a calendar entry', () => {
  assert.equal(moveBlocker(event(), student), 'Students cannot reschedule');
  assert.equal(moveBlocker(event(), teacher, { taught: ['sub1'] }), null);
  assert.match(moveBlocker(event(), teacher, { taught: ['other'] }), /Not allocated/);
  assert.match(moveBlocker(event({ subject: null }), teacher, { taught: ['sub1'] }), /administrators/);
  assert.equal(moveBlocker(event({ subject: null }), admin), null);
  assert.match(moveBlocker(event({ source: { kind: 'announcement', id: 'x' } }), admin), /Announcements/);
});

test('quizzes move only before anyone can start them', () => {
  const quiz = event({ source: { kind: 'assessment', id: 'q' } });
  assert.equal(
    moveBlocker(quiz, teacher, { taught: ['sub1'], linked: { state: 'SCHEDULED', attempts: 0 } }),
    null,
  );
  assert.equal(
    moveBlocker(quiz, teacher, { taught: ['sub1'], linked: { state: 'DRAFT', attempts: 0 } }),
    null,
  );
  assert.match(
    moveBlocker(quiz, teacher, { taught: ['sub1'], linked: { state: 'AVAILABLE', attempts: 0 } }),
    /already opened/,
  );
  assert.match(
    moveBlocker(quiz, teacher, { taught: ['sub1'], linked: { state: 'SCHEDULED', attempts: 2 } }),
    /started/,
  );
  assert.match(moveBlocker(quiz, admin, {}), /no longer exists/);
  const assignment = event({ source: { kind: 'assignment', id: 'a' } });
  assert.equal(moveBlocker(assignment, teacher, { taught: ['sub1'], linked: { dueAt: new Date() } }), null);
});
