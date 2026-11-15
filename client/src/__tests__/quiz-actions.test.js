import { describe, expect, test } from 'vitest';
import { studentActionFor } from '../components/domain/QuizCard.jsx';
import { fileNameFrom } from '../components/ui/ExportMenu.jsx';

const quiz = (fields) => ({ _id: 'q1', state: 'AVAILABLE', attemptsAllowed: 1, availabilityMode: 'instant', myAttempts: {}, ...fields });

describe('studentActionFor', () => {
  test('an open quiz with no attempt can be started', () => {
    expect(studentActionFor(quiz()).kind).toBe('start');
    expect(studentActionFor(quiz()).to).toBe('/exam/q1');
  });
  test('an attempt in progress is resumed', () => {
    expect(studentActionFor(quiz({ myAttempts: { activeId: 'a1', count: 1 } }))).toMatchObject({ kind: 'resume', to: '/exam/q1?resume=1' });
  });
  test('a used-up attempt shows the submission, then the result once published', () => {
    expect(studentActionFor(quiz({ myAttempts: { count: 1, lastSubmitReason: 'TIMEOUT' } }))).toMatchObject({ kind: 'submitted', label: 'Submitted at time-up' });
    expect(studentActionFor(quiz({ state: 'PUBLISHED', myAttempts: { count: 1 }, myResult: { rawMarks: 7 } }))).toMatchObject({ kind: 'result', to: '/results/q1' });
  });
  test('a second attempt is offered as a retake', () => {
    expect(studentActionFor(quiz({ attemptsAllowed: 2, myAttempts: { count: 1 } }))).toMatchObject({ kind: 'start', label: 'Retake' });
  });
  test('room quizzes are joined with a code; scheduled ones are locked', () => {
    expect(studentActionFor(quiz({ availabilityMode: 'room', state: 'SCHEDULED' })).kind).toBe('join');
    expect(studentActionFor(quiz({ state: 'SCHEDULED', availabilityMode: 'scheduled', startsAt: null })).kind).toBe('locked');
  });
});

describe('fileNameFrom', () => {
  const res = (value) => ({ headers: { get: () => value } });
  test('uses the server filename from Content-Disposition', () => {
    expect(fileNameFrom(res('attachment; filename="mca261ia-cie.xlsx"'), 'x.xlsx')).toBe('mca261ia-cie.xlsx');
  });
  test('falls back when the header is missing', () => {
    expect(fileNameFrom(res(null), 'export.csv')).toBe('export.csv');
  });
});
