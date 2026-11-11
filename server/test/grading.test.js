import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateObjective, sameAnswer } from '../src/services/grading.js';
test('automatically scores MCQ and normalized single-line fill-in answers', () => {
  const questions = [
    { _id: '1', type: 'single', marks: 5, correctAnswer: 'A' },
    { _id: '2', type: 'fill_blank', marks: 5, correctAnswer: 'Queue' },
  ];
  const answers = [
    { question: '1', value: 'wrong' },
    { question: '2', value: ' queue  ' },
  ];
  assert.deepEqual(evaluateObjective(questions, answers), { objectiveScore: 5 });
});
test('scores all correct answers up to the fixed quiz total', () => {
  const questions = [
    { _id: '1', type: 'single', marks: 5, correctAnswer: 'A' },
    { _id: '2', type: 'fill_blank', marks: 5, correctAnswer: 'Queue' },
  ];
  const answers = [
    { question: '1', value: 'A' },
    { question: '2', value: 'Queue' },
  ];
  assert.deepEqual(evaluateObjective(questions, answers), { objectiveScore: 10 });
});
test('normalizes scalar answer casing and whitespace', () =>
  assert.equal(sameAnswer(' True ', 'true'), true));
test('reviewAnswers marks each question correct, incorrect or skipped', async () => {
  const { reviewAnswers } = await import('../src/services/grading.js');
  const questions = [
    {
      _id: '1',
      type: 'single',
      marks: 2,
      correctAnswer: 'B',
      options: [
        { key: 'A', text: 'x' },
        { key: 'B', text: 'y' },
      ],
    },
    { _id: '2', type: 'fill_blank', marks: 3, correctAnswer: 'Stack' },
    { _id: '3', type: 'single', marks: 5, correctAnswer: 'A', options: [] },
  ];
  const items = reviewAnswers(questions, [
    { question: '1', value: 'B', flagged: true },
    { question: '2', value: 'queue' },
    { question: '3', value: '   ' },
  ]);
  assert.deepEqual(
    items.map((i) => [i.status, i.awarded, i.given]),
    [
      ['correct', 2, 'B'],
      ['incorrect', 0, 'queue'],
      ['skipped', 0, null],
    ],
  );
  assert.equal(items[0].flagged, true);
  assert.deepEqual(items[0].options, [
    { key: 'A', text: 'x' },
    { key: 'B', text: 'y' },
  ]);
});
