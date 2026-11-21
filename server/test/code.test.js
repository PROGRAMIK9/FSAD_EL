import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  fakeExecute,
  getBatch,
  limitsFor,
  mapStatus,
  resolveLanguageIds,
  sameOutput,
  submitBatch,
} from '../src/services/judge0.js';
import { buildItems, hashSource, scoreResults } from '../src/services/code-runner.js';
import { evaluateObjective, publicRunResults, reviewAnswers } from '../src/services/grading.js';
import { studentCodeView } from '../src/routes/code.js';
import { validateQuestionBatch } from '../src/routes/questions.js';

const question = {
  _id: 'q1',
  type: 'code',
  text: 'Add two numbers',
  marks: 4,
  code: {
    languages: ['c', 'python'],
    starter: new Map([['python', 'a, b = map(int, input().split())\n']]),
    comparison: 'trim',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    testCases: [
      { input: '1 2', expectedOutput: '3', weight: 1, hidden: false },
      { input: '5 5', expectedOutput: '10', weight: 1, hidden: true },
      { input: '-1 1', expectedOutput: '0', weight: 2, hidden: true },
    ],
  },
};

test('output comparison modes', () => {
  assert.ok(sameOutput('3\n', '3', 'trim'));
  assert.ok(sameOutput('a  \r\nb\n\n', 'a\nb', 'trim'));
  assert.ok(!sameOutput(' 3', '3', 'trim'), 'leading spaces matter in trim mode');
  assert.ok(!sameOutput('3\n', '3', 'exact'));
  assert.ok(sameOutput('1 2\n3', '1\n2 3 ', 'tokens'));
  assert.ok(!sameOutput('1 2', '1 2 3', 'tokens'));
});

test('Judge0 status ids map to verdicts', () => {
  assert.equal(mapStatus(1), 'PENDING');
  assert.equal(mapStatus(3), 'OK');
  assert.equal(mapStatus(5), 'TLE');
  assert.equal(mapStatus(6), 'CE');
  assert.equal(mapStatus(11), 'RE');
  assert.equal(mapStatus(11, 'std::bad_alloc'), 'MLE');
  assert.equal(mapStatus(13), 'IE');
});

test('sandbox limits give Java and Python extra CPU and never allow network', () => {
  const c = limitsFor('c', { timeLimitMs: 1000, memoryLimitMb: 128 });
  const java = limitsFor('java', { timeLimitMs: 1000, memoryLimitMb: 128 });
  assert.equal(c.cpu_time_limit, 1);
  assert.equal(java.cpu_time_limit, 3);
  assert.equal(c.memory_limit, 128 * 1024);
  assert.equal(c.enable_network, false);
  assert.equal(limitsFor('cpp', { memoryLimitMb: 4096 }).memory_limit, 512 * 1024);
});

test('a run uses sample tests plus custom input; submit uses every test', () => {
  const run = { kind: 'run', language: 'python', source: 'print(1)', stdin: '7' };
  const items = buildItems(run, question);
  assert.equal(items.length, 2);
  assert.equal(items[0].test.index, 0);
  assert.equal(items[1].custom, true);
  assert.equal(items[1].stdin, '7');
  const all = buildItems({ ...run, kind: 'submit', stdin: undefined }, question);
  assert.deepEqual(
    all.map((i) => i.test.index),
    [0, 1, 2],
  );
  const scratch = buildItems({ kind: 'scratch', language: 'c', source: 'x', stdin: '' }, null);
  assert.equal(scratch.length, 1);
  assert.equal(scratch[0].custom, true);
});

test('scores are weighted by test case', () => {
  const items = buildItems({ kind: 'submit', language: 'python', source: 's' }, question);
  const outputs = [
    { status: 'OK', stdout: '3\n' },
    { status: 'OK', stdout: '11' },
    { status: 'OK', stdout: '0' },
  ];
  const scored = scoreResults(items, outputs, question);
  assert.equal(scored.passedWeight, 3);
  assert.equal(scored.totalWeight, 4);
  assert.equal(scored.score, 3);
  assert.deepEqual(
    scored.results.map((r) => r.status),
    ['AC', 'WA', 'AC'],
  );
  const ce = scoreResults(
    items,
    items.map(() => ({ status: 'CE', compileOutput: 'boom' })),
    question,
  );
  assert.equal(ce.score, 0);
  assert.equal(ce.results[0].status, 'CE');
});

test('the fake judge passes correct code and honours failure markers', () => {
  const items = buildItems({ kind: 'submit', language: 'python', source: 'ok' }, question);
  const pass = scoreResults(items, fakeExecute(items), question);
  assert.equal(pass.score, 4);
  const wa = buildItems({ kind: 'submit', language: 'python', source: '# FAKE:WA' }, question);
  assert.equal(scoreResults(wa, fakeExecute(wa), question).score, 0);
  const tle = fakeExecute([{ source: 'FAKE:TLE' }]);
  assert.equal(tle[0].status, 'TLE');
});

test('students never see hidden tests or their output', () => {
  const view = studentCodeView(question.code);
  assert.equal(view.samples.length, 1);
  assert.equal(view.hiddenCount, 2);
  assert.equal(view.samples[0].expectedOutput, '3');
  assert.equal(view.starter.python, 'a, b = map(int, input().split())\n');
  assert.ok(!JSON.stringify(view).includes('-1 1'));

  const results = [
    { index: 0, hidden: false, status: 'AC', stdout: '3' },
    { index: 1, hidden: true, status: 'WA', stdout: 'SECRET' },
  ];
  const pub = publicRunResults(results);
  assert.equal(pub[0].stdout, '3');
  assert.equal(pub[1].stdout, undefined);
  assert.equal(pub[1].status, 'WA');
  assert.equal(publicRunResults(results, { showHidden: true })[1].stdout, 'SECRET');
});

test('review and objective scoring treat code questions separately', () => {
  const mcq = { _id: 'q2', type: 'single', marks: 1, correctAnswer: 'A', options: [] };
  const answers = [
    { question: 'q1', value: { language: 'python', source: 'print(3)' } },
    { question: 'q2', value: 'A' },
  ];
  assert.equal(evaluateObjective([question, mcq], answers).objectiveScore, 1);
  const runs = [
    {
      question: 'q1',
      status: 'done',
      score: 3,
      passedWeight: 3,
      totalWeight: 4,
      results: [{ index: 1, hidden: true, status: 'WA', stdout: 'SECRET' }],
    },
  ];
  const [code, objective] = reviewAnswers([question, mcq], answers, runs);
  assert.equal(code.status, 'partial');
  assert.equal(code.awarded, 3);
  assert.equal(code.code.samples.length, 1);
  assert.equal(code.code.results[0].stdout, undefined);
  assert.equal(objective.status, 'correct');
  assert.equal(reviewAnswers([question], answers, [])[0].status, 'pending');
  assert.equal(reviewAnswers([question], [], [])[0].status, 'skipped');
});

test('coding questions need languages, tests and a visible sample', () => {
  const base = {
    type: 'code',
    text: 'Reverse a string',
    marks: 5,
    code: { languages: ['cpp'], testCases: [{ input: 'ab', expectedOutput: 'ba' }] },
  };
  const ok = validateQuestionBatch([base]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.questions[0].code.comparison, 'trim');
  const { errors } = validateQuestionBatch([
    { ...base, code: undefined },
    { ...base, code: { ...base.code, testCases: [{ input: '', expectedOutput: 'x', hidden: true }] } },
    { ...base, code: { ...base.code, languages: ['ruby'] } },
    { ...base, type: 'single', text: 'x'.repeat(2500), options: [], correctAnswer: 'A' },
  ]);
  assert.deepEqual(
    errors.map((e) => e.index),
    [0, 1, 2, 3],
  );
  assert.match(errors[1].error, /visible/);
});

test('source hashes depend on language and code', () => {
  assert.equal(hashSource('c', 'x'), hashSource('c', 'x'));
  assert.notEqual(hashSource('c', 'x'), hashSource('cpp', 'x'));
});

test('the Judge0 client batches, base64-encodes and authenticates', async (t) => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, token: req.headers['x-auth-token'], body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/languages')
        return res.end(
          JSON.stringify([
            { id: 71, name: 'Python (3.8.1)' },
            { id: 92, name: 'Python (3.11.2)' },
            { id: 54, name: 'C++ (GCC 9.2.0)' },
          ]),
        );
      if (req.method === 'POST') return res.end(JSON.stringify([{ token: 't1' }, { token: 't2' }]));
      const enc = (s) => Buffer.from(s).toString('base64');
      res.end(
        JSON.stringify({
          submissions: [
            { token: 't1', status_id: 3, stdout: enc('3\n'), time: '0.012', memory: 3000 },
            { token: 't2', status_id: 6, compile_output: enc('error'), time: null, memory: null },
          ],
        }),
      );
    });
  });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const env = { ...process.env };
  t.after(() => (process.env = env));
  process.env.JUDGE0_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.JUDGE0_AUTH_TOKEN = 'secret';
  delete process.env.JUDGE_MODE;

  const ids = await resolveLanguageIds();
  assert.equal(ids.python, 92, 'newest Python wins');
  const limits = limitsFor('python');
  const tokens = await submitBatch([
    { language: 'python', source: 'print(3)', stdin: '', limits },
    { language: 'cpp', source: 'int main(', stdin: '', limits },
  ]);
  assert.deepEqual(tokens, ['t1', 't2']);
  const post = seen.find((s) => s.method === 'POST');
  assert.equal(post.token, 'secret');
  const sent = JSON.parse(post.body).submissions;
  assert.equal(sent[0].language_id, 92);
  assert.equal(Buffer.from(sent[0].source_code, 'base64').toString(), 'print(3)');
  assert.equal(sent[0].enable_network, false);

  const states = await getBatch(tokens);
  assert.equal(states[0].status, 'OK');
  assert.equal(states[0].stdout, '3\n');
  assert.equal(states[0].timeMs, 12);
  assert.equal(states[1].status, 'CE');
  assert.equal(states[1].compileOutput, 'error');
});
