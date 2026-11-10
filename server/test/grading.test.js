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
