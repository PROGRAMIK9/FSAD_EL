import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BATCH, validateQuestionBatch } from '../src/routes/questions.js';

const mcq = (fields = {}) => ({
  type: 'single',
  text: 'Which structure is first-in, first-out?',
  marks: 1,
  options: [
    { key: 'A', text: 'Stack' },
    { key: 'B', text: 'Queue' },
  ],
  correctAnswer: 'B',
  ...fields,
});
const fill = (fields = {}) => ({
  type: 'fill_blank',
  text: 'HTTP status for Not Found is _____',
  marks: 0.5,
  correctAnswer: ' 404 ',
  ...fields,
});

test('a valid batch is returned cleaned, with defaults applied', () => {
  const { questions, errors } = validateQuestionBatch([mcq(), fill()]);
  assert.deepEqual(errors, []);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].difficulty, 'medium');
  assert.equal(questions[1].correctAnswer, '404');
  assert.deepEqual(questions[1].options, []);
});

test('each rejected question is reported at its own index', () => {
  const { questions, errors } = validateQuestionBatch([
    mcq(),
    mcq({ correctAnswer: undefined }),
    fill({ correctAnswer: '' }),
    fill({ marks: 0.3 }),
  ]);
  assert.equal(questions.length, 1);
  assert.deepEqual(
    errors.map((e) => e.index),
    [1, 2, 3],
  );
  assert.match(errors[0].error, /correct option/);
  assert.match(errors[1].error, /answer is required/);
  assert.match(errors[2].error, /^marks: /);
});

test('empty and oversized batches are refused', () => {
  assert.throws(() => validateQuestionBatch([]), /at least one/);
  assert.throws(() => validateQuestionBatch(Array.from({ length: MAX_BATCH + 1 }, () => mcq())), /at most/);
});
