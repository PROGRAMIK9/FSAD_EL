import { describe, expect, test } from 'vitest';
import {
  BLANK,
  linesFromPdfItems,
  normaliseLine,
  parseQuestionPaper,
  takeMarks,
} from '../lib/paper-parser.js';

const parse = (text) => parseQuestionPaper(text).drafts;

describe('parseQuestionPaper', () => {
  test('reads numbered MCQs with one option per line', () => {
    const [q1, q2] = parse(`
      1. Which data structure is first-in, first-out?
      (a) Stack
      (b) Queue
      (c) Tree
      (d) Graph
      2) Which HTTP method is idempotent?
      a) POST
      b) PUT
    `);
    expect(q1).toMatchObject({
      number: '1',
      type: 'single',
      text: 'Which data structure is first-in, first-out?',
      options: ['Stack', 'Queue', 'Tree', 'Graph'],
      correctIndex: -1,
    });
    expect(q2).toMatchObject({ number: '2', type: 'single', options: ['POST', 'PUT'] });
  });

  test('splits options written on the question line or two to a line', () => {
    const [q1, q2] = parse(`
      Q1. Which is FIFO? (a) Stack (b) Queue (c) Tree (d) Graph
      Q.2 Pick the NoSQL database
      (a) MongoDB (b) MySQL
      (c) Oracle (d) Postgres
    `);
    expect(q1).toMatchObject({ text: 'Which is FIFO?', options: ['Stack', 'Queue', 'Tree', 'Graph'] });
    expect(q2).toMatchObject({ number: '2', options: ['MongoDB', 'MySQL', 'Oracle', 'Postgres'] });
  });

  test('joins wrapped question and option lines', () => {
    const [q] = parse(`
      3. In the MVC pattern, which component handles
      user input?
      (a) Model
      (b) The controller, which coordinates the
      model and the view
    `);
    expect(q.text).toBe('In the MVC pattern, which component handles user input?');
    expect(q.options[1]).toBe('The controller, which coordinates the model and the view');
  });

  test('takes marks from the question or its last option', () => {
    const [a, b, c, d] = parse(`
      1. A function bundled with its scope is a ____ (2 marks)
      2. Which keyword declares a constant?
      (a) var (b) const [1]
      3. Expand REST ________ 1M
      4. JavaScript was created in ____ (0.5)
    `);
    expect(a.marks).toBe(2);
    expect(b).toMatchObject({ marks: 1, options: ['var', 'const'] });
    expect(c.marks).toBe(1);
    expect(d.marks).toBe(0.5);
  });

  test('does not mistake f(2) for marks, and leaves marks empty when absent', () => {
    const [q] = parse('1. The value of f(2) is ____');
    expect(q.marks).toBeNull();
    expect(q.text).toBe(`The value of f(2) is ${BLANK}`);
  });

  test('turns blanks into fill-in questions', () => {
    const [q] = parse('5. HTTP status code ...... means Not Found.');
    expect(q).toMatchObject({
      type: 'fill_blank',
      text: `HTTP status code ${BLANK} means Not Found.`,
      warnings: [],
    });
  });

  test('reads answers given under a question or in an answer key', () => {
    const [q1, q2, q3, q4] = parse(`
      1. Which is FIFO? (a) Stack (b) Queue
      Ans: (b)
      2. Pick a NoSQL store (a) MySQL (b) MongoDB
      Answer: MongoDB
      3. Default port of HTTP is ____
      Answer: 80
      4. Pick a stack operation (a) push (b) enqueue
      Answer key
      4-A
    `);
    expect(q1.correctIndex).toBe(1);
    expect(q2.correctIndex).toBe(1);
    expect(q3.answer).toBe('80');
    expect(q4.correctIndex).toBe(0);
  });

  test('skips header lines and section headings', () => {
    const { drafts, skipped } = parseQuestionPaper(`
      RV College of Engineering
      USN: 1RV24MC001
      Time: 1 hour    Max Marks: 10
      Note: Answer all questions
      PART A
      1. Which is FIFO? (a) Stack (b) Queue
      PART B
      Page 1 of 2
      2. Which is LIFO? (a) Stack (b) Queue
    `);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].options).toEqual(['Stack', 'Queue']);
    expect(skipped).toEqual(expect.arrayContaining(['RV College of Engineering', 'PART B', 'Page 1 of 2']));
  });

  test('numbers sub-parts and splits marked sub-questions', () => {
    const drafts = parse(`
      1. (a) Define middleware. [5]
      (b) Explain the event loop. [5]
      2a) What is JSX? CO1 L1 2
      3. Answer the following:
      (a) Define REST. (4 marks)
      (b) Define GraphQL. (4 marks)
    `);
    expect(drafts.map((d) => d.number)).toEqual(['1a', '1b', '2a', '3a', '3b']);
    expect(drafts.map((d) => d.marks)).toEqual([5, 5, 2, 4, 4]);
    expect(drafts[2].text).toBe('What is JSX?');
    expect(drafts[3].text).toBe('Define REST.');
  });

  test('flags long-answer questions and caps marks at 10', () => {
    const [q] = parse('1. Explain the architecture of Node.js with a neat diagram. (12 marks)');
    expect(q.type).toBe('fill_blank');
    expect(q.marks).toBe(10);
    expect(q.warnings.join(' ')).toMatch(/long-answer/);
    expect(q.warnings.join(' ')).toMatch(/at most 10/);
  });

  test('copes with OCR noise: capital option letters, table borders and curly quotes', () => {
    const [q] = parse(`
      | 1. Which of these is ‘falsy’? |
      (A) "0"
      (B) 0
      (C) []
    `);
    expect(q).toMatchObject({ text: "Which of these is 'falsy'?", options: ['"0"', '0', '[]'] });
  });

  test('ignores decimals and years at the start of a line', () => {
    const [q] = parse(`
      1. Which year was ES6 released?
      2015 brought classes and modules.
      1.5 times faster is a myth.
    `);
    expect(q.text).toBe(
      'Which year was ES6 released? 2015 brought classes and modules. 1.5 times faster is a myth.',
    );
  });

  test('a blank that wrapped onto its own line stays with its question', () => {
    const { drafts, skipped } = parseQuestionPaper(`
      3. The HTTP status code for Not Found is
      ________
      4. Pick one (a) x (b) y
      ________________
    `);
    expect(drafts[0]).toMatchObject({
      type: 'fill_blank',
      text: `The HTTP status code for Not Found is ${BLANK}`,
      warnings: [],
    });
    expect(drafts[1].options).toEqual(['x', 'y']);
    expect(skipped).toEqual(['________________']);
  });
});

describe('linesFromPdfItems', () => {
  // Items as pdf.js reports them for a Chromium-printed page (spaces and ligatures split out).
  const item = (str, x, y, width, height = 21) => ({ str, transform: [1, 0, 0, 1, x, y], width, height });
  test('joins ligature fragments and explicit space items, top to bottom', () => {
    const items = [
      item('3. The HTTP status code', 36, 674.1, 300),
      item('1. Which data structure is', 36, 783.6, 277.2),
      item(' ', 313.2, 783.6, 8.9, 0),
      item('fi', 319.9, 783.6, 14),
      item('rst-in,', 333.9, 783.6, 63.3),
      item('(a) POST', 36, 728.9, 95.3),
      item(' ', 131.3, 728.9, 35.6, 0),
      item('(b) PUT', 158, 728.9, 82),
      item('________', 36, 641.1, 84),
    ];
    expect(linesFromPdfItems(items)).toBe(
      '1. Which data structure is first-in,\n(a) POST (b) PUT\n3. The HTTP status code\n________',
    );
  });
  test('adds a space where words are separated only by position', () => {
    expect(linesFromPdfItems([item('Stack', 36, 700, 50), item('Queue', 100, 700, 55)])).toBe('Stack Queue');
  });
});

describe('helpers', () => {
  test('takeMarks reads common annotations', () => {
    expect(takeMarks('Define X [02]')).toEqual({ text: 'Define X', marks: 2 });
    expect(takeMarks('Define X 05 CO2 L3')).toEqual({ text: 'Define X', marks: 5 });
    expect(takeMarks('Define X (1 Mark)')).toEqual({ text: 'Define X', marks: 1 });
    expect(takeMarks('Define X')).toEqual({ text: 'Define X', marks: null });
  });
  test('normaliseLine fixes ligatures, dashes and spacing', () => {
    expect(normaliseLine('  deﬁne   a  — b\t')).toBe('define a - b');
  });
});
