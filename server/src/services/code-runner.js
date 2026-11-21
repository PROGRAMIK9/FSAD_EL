import { createHash } from 'node:crypto';
import { CodeRun, Question } from '../models/index.js';
import { clip, fakeExecute, getBatch, judgeMode, limitsFor, sameOutput, submitBatch } from './judge0.js';
import { toStudent } from './realtime.js';
import { completeCodeGrading } from './attempts.js';

/**
 * Code execution queue. Runs are CodeRun documents (status queued → running → done | error),
 * claimed atomically, so a burst (an exam ending for 250 students) waits in MongoDB instead of
 * flooding Judge0. JUDGE_MAX_INFLIGHT caps executions handed to Judge0 at once.
 */

const MAX_INFLIGHT = Number(process.env.JUDGE_MAX_INFLIGHT) || 40;
const MAX_TRIES = 3;
const STALE_MS = 3 * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let inflight = 0;
const active = new Set();

export const hashSource = (language, source) =>
  createHash('sha256').update(`${language}\0${source}`).digest('hex');

export const executionEnabled = () => judgeMode() !== 'off';

/** Queues a run and nudges the dispatcher. */
export async function enqueueRun(fields) {
  const run = await CodeRun.create({ ...fields, sourceHash: hashSource(fields.language, fields.source) });
  setImmediate(() => pump().catch((err) => console.error('[code-runner]', err)));
  return run;
}

/** The executions a run needs: test cases picked by kind, plus custom stdin. */
export function buildItems(run, question) {
  const code = question?.code || {};
  const limits = limitsFor(run.language, code);
  const base = { language: run.language, source: run.source, limits };
  const tests = (code.testCases || []).map((t, index) => ({ ...(t.toObject?.() ?? t), index }));
  const chosen = run.kind === 'run' ? tests.filter((t) => !t.hidden) : run.kind === 'scratch' ? [] : tests;
  const items = chosen.map((t) => ({
    ...base,
    stdin: t.input,
    expectedOutput: t.expectedOutput,
    test: { index: t.index, hidden: t.hidden, weight: t.weight ?? 1 },
  }));
  if (run.stdin !== undefined && run.stdin !== null && (run.kind === 'run' || run.kind === 'scratch'))
    items.push({ ...base, stdin: run.stdin, custom: true });
  return items;
}

/** Turns raw executions into stored results and a weighted score. */
export function scoreResults(items, outputs, question) {
  const mode = question?.code?.comparison || 'trim';
  let passedWeight = 0;
  let totalWeight = 0;
  const results = items.map((it, i) => {
    const o = outputs[i];
    const passed = it.custom ? null : o.status === 'OK' && sameOutput(o.stdout, it.expectedOutput, mode);
    const status = it.custom ? o.status : o.status === 'OK' ? (passed ? 'AC' : 'WA') : o.status;
    if (!it.custom) {
      totalWeight += it.test.weight;
      if (passed) passedWeight += it.test.weight;
    }
    return {
      index: it.custom ? -1 : it.test.index,
      custom: Boolean(it.custom),
      hidden: Boolean(it.test?.hidden),
      weight: it.test?.weight,
      status,
      passed,
      timeMs: o.timeMs,
      memoryKb: o.memoryKb,
      stdout: clip(o.stdout),
      stderr: clip(o.stderr || (o.status === 'RE' ? o.message : ''), 2000),
      compileOutput: clip(o.compileOutput, 4000),
    };
  });
  const marks = question?.marks || 0;
  const score = totalWeight ? Math.round(((marks * passedWeight) / totalWeight) * 100) / 100 : 0;
  return { results, passedWeight, totalWeight, score };
}

async function execute(items) {
  if (!items.length) return [];
  if (judgeMode() === 'fake') {
    await sleep(30);
    return fakeExecute(items);
  }
  const tokens = await submitBatch(items);
  let wait = 400;
  const deadline = Date.now() + 2 * 60_000;
  while (Date.now() < deadline) {
    await sleep(wait);
    const states = await getBatch(tokens);
    if (states.every((s) => s.status !== 'PENDING')) return states;
    wait = Math.min(2000, Math.round(wait * 1.5));
  }
  throw new Error('Timed out waiting for Judge0');
}

async function processRun(run) {
  const question = run.question ? await Question.findById(run.question) : null;
  const items = buildItems(run, question);
  inflight += Math.max(1, items.length);
  active.add(String(run._id));
  try {
    const outputs = await execute(items);
    const scored = scoreResults(items, outputs, question);
    await CodeRun.updateOne(
      { _id: run._id },
      { $set: { ...scored, status: 'done', finishedAt: new Date() }, $unset: { error: 1 } },
    );
  } catch (err) {
    const retry = run.tries < MAX_TRIES;
    console.warn(`[code-runner] run ${run._id} failed (try ${run.tries}): ${err.message}`);
    await CodeRun.updateOne(
      { _id: run._id },
      retry
        ? { $set: { status: 'queued', error: err.message } }
        : { $set: { status: 'error', error: err.message, finishedAt: new Date() } },
    );
    if (retry) return;
  } finally {
    inflight -= Math.max(1, items.length);
    active.delete(String(run._id));
  }
  await announce(run._id);
}

async function announce(runId) {
  const run = await CodeRun.findById(runId).select('user status kind attempt score passedWeight totalWeight');
  if (!run) return;
  toStudent(String(run.user), 'code:result', {
    runId: String(run._id),
    status: run.status,
    kind: run.kind,
  });
  if (run.kind === 'final' && run.attempt) await completeCodeGrading(run.attempt);
}

let pumping = false;
/** Claims queued runs while there is capacity. Safe to call often. */
export async function pump() {
  if (pumping || !executionEnabled()) return;
  pumping = true;
  try {
    while (inflight < MAX_INFLIGHT) {
      const run = await CodeRun.findOneAndUpdate(
        { status: 'queued' },
        { $set: { status: 'running', claimedAt: new Date() }, $inc: { tries: 1 } },
        { sort: { createdAt: 1 }, new: true },
      );
      if (!run) break;
      processRun(run).catch((err) => console.error('[code-runner]', err));
    }
  } finally {
    pumping = false;
  }
}

/** Puts runs back in the queue when the process that claimed them died. */
export async function requeueStale(now = Date.now()) {
  const res = await CodeRun.updateMany(
    {
      status: 'running',
      claimedAt: { $lt: new Date(now - STALE_MS) },
      _id: { $nin: [...active] },
    },
    { $set: { status: 'queued' } },
  );
  return res.modifiedCount;
}

/** Background loop started by the server. */
export function startCodeRunner() {
  if (!executionEnabled()) {
    console.warn('[code-runner] code execution is off (set JUDGE0_URL)');
    return () => {};
  }
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    const job = ticks % 60 === 0 ? requeueStale().then(pump) : pump();
    job.catch((err) => console.error('[code-runner]', err));
  }, 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Waits until a run leaves the queue (tests and fake mode). */
export async function waitForRun(id, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await pump();
    const run = await CodeRun.findById(id);
    if (run && (run.status === 'done' || run.status === 'error')) return run;
    await sleep(25);
  }
  throw new Error(`Run ${id} did not finish`);
}
