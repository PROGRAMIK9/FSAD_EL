/**
 * Thin client for a self-hosted Judge0 CE instance (https://judge0.com), which compiles and runs
 * untrusted code inside the isolate sandbox. Code never runs on the app host.
 *
 * JUDGE0_URL         base URL of the Judge0 API (e.g. http://10.0.0.5:2358)
 * JUDGE0_AUTH_TOKEN  value of Judge0's AUTHN_TOKEN, sent as X-Auth-Token
 * JUDGE_MODE         'runner' | 'judge0' | 'fake' | 'off'. Defaults to runner when RUNNER_URL is
 *                    set (see sandbox.js), judge0 when JUDGE0_URL is set, otherwise fake outside
 *                    production (deterministic stand-in for tests and dev). Judge0 needs cgroup v1.
 */

export const LANGUAGES = {
  c: { label: 'C', judgeName: /^C \(GCC/, defaultId: 50, extraCpu: 0 },
  cpp: { label: 'C++', judgeName: /^C\+\+ \(GCC/, defaultId: 54, extraCpu: 0 },
  java: { label: 'Java', judgeName: /^Java \(OpenJDK/, defaultId: 62, extraCpu: 2 },
  python: { label: 'Python 3', judgeName: /^Python \(3/, defaultId: 71, extraCpu: 1 },
};
export const LANGUAGE_KEYS = Object.keys(LANGUAGES);

const languageIds = Object.fromEntries(LANGUAGE_KEYS.map((k) => [k, LANGUAGES[k].defaultId]));

export function judgeMode() {
  if (process.env.JUDGE_MODE) return process.env.JUDGE_MODE;
  if (process.env.RUNNER_URL) return 'runner';
  if (process.env.JUDGE0_URL) return 'judge0';
  return process.env.NODE_ENV === 'production' ? 'off' : 'fake';
}

const OUTPUT_LIMIT = 4000;
const b64 = (s) => Buffer.from(String(s ?? ''), 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');
export const clip = (s, n = OUTPUT_LIMIT) =>
  s && s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters)` : s || '';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (process.env.JUDGE0_AUTH_TOKEN) h['X-Auth-Token'] = process.env.JUDGE0_AUTH_TOKEN;
  return h;
}

async function call(path, init = {}) {
  const base = (process.env.JUDGE0_URL || '').replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Judge0 ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Matches our languages to the ids this Judge0 install uses (newest version wins). */
export async function resolveLanguageIds() {
  if (judgeMode() !== 'judge0') return languageIds;
  try {
    const list = await call('/languages');
    for (const key of LANGUAGE_KEYS) {
      const matches = list.filter((l) => LANGUAGES[key].judgeName.test(l.name));
      if (matches.length) languageIds[key] = Math.max(...matches.map((l) => l.id));
      else console.warn(`[judge0] no language matching ${key}; using id ${languageIds[key]}`);
    }
    console.log('[judge0] language ids', languageIds);
  } catch (err) {
    console.warn(`[judge0] could not list languages (${err.message}); using defaults`);
  }
  return languageIds;
}

/**
 * Judge0 status ids: 1 queued, 2 processing, 3 accepted (ran fine), 4 wrong answer,
 * 5 time limit, 6 compile error, 7-12 runtime errors, 13 internal error, 14 exec format error.
 */
export function mapStatus(id, message = '') {
  if (id === 1 || id === 2) return 'PENDING';
  if (id === 3 || id === 4) return 'OK';
  if (id === 5) return 'TLE';
  if (id === 6) return 'CE';
  if (id >= 7 && id <= 12) return /memory|bad_alloc|SIGKILL/i.test(message) ? 'MLE' : 'RE';
  return 'IE';
}

/** Compares program output with the expected output. */
export function sameOutput(actual, expected, mode = 'trim') {
  const a = String(actual ?? '').replace(/\r\n?/g, '\n');
  const e = String(expected ?? '').replace(/\r\n?/g, '\n');
  if (mode === 'exact') return a === e;
  if (mode === 'tokens') {
    const ta = a.split(/\s+/).filter(Boolean);
    const te = e.split(/\s+/).filter(Boolean);
    return ta.length === te.length && ta.every((t, i) => t === te[i]);
  }
  const norm = (s) =>
    s
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  return norm(a) === norm(e);
}

/** Per-run sandbox limits for one language. */
export function limitsFor(language, { timeLimitMs = 2000, memoryLimitMb = 256 } = {}) {
  const cpu = Math.min(10, timeLimitMs / 1000 + LANGUAGES[language].extraCpu);
  return {
    cpu_time_limit: cpu,
    wall_time_limit: Math.min(20, cpu * 2 + 1),
    memory_limit: Math.min(512, memoryLimitMb) * 1024,
    max_file_size: 1024,
    enable_network: false,
    max_processes_and_or_threads: language === 'java' ? 64 : 16,
  };
}

/** Judge0 refuses batches larger than its MAX_SUBMISSION_BATCH_SIZE (20 by default). */
const batchSize = () => Number(process.env.JUDGE0_BATCH_SIZE) || 20;
const chunks = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Queues executions on Judge0. Each item is `{ language, source, stdin, limits }`.
 * Returns one token per item.
 */
export async function submitBatch(items) {
  const tokens = [];
  for (const part of chunks(items, batchSize())) tokens.push(...(await submitChunk(part)));
  return tokens;
}

async function submitChunk(items) {
  const body = {
    submissions: items.map((it) => ({
      language_id: languageIds[it.language],
      source_code: b64(it.source),
      stdin: b64(it.stdin),
      ...it.limits,
    })),
  };
  const out = await call('/submissions/batch?base64_encoded=true', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return out.map((o, i) => {
    if (!o.token) throw new Error(`Judge0 rejected item ${i}: ${JSON.stringify(o).slice(0, 200)}`);
    return o.token;
  });
}

const FIELDS = 'token,stdout,stderr,compile_output,message,status_id,time,memory';

/** Fetches the current state of submitted tokens, decoded. */
export async function getBatch(tokens) {
  const parts = await Promise.all(
    chunks(tokens, batchSize()).map((part) =>
      call(`/submissions/batch?tokens=${part.join(',')}&base64_encoded=true&fields=${FIELDS}`),
    ),
  );
  return parts
    .flatMap((out) => out.submissions)
    .map((s) => ({
      token: s.token,
      status: mapStatus(s.status_id, unb64(s.message)),
      stdout: unb64(s.stdout),
      stderr: unb64(s.stderr),
      compileOutput: unb64(s.compile_output),
      message: unb64(s.message),
      timeMs: s.time ? Math.round(Number(s.time) * 1000) : null,
      memoryKb: s.memory ?? null,
    }));
}

/**
 * Deterministic stand-in used in tests, CI and local dev without Judge0. It never runs code:
 * the program "prints" the expected output, or echoes stdin for custom input. Markers in the
 * source force other outcomes: FAKE:WA, FAKE:CE, FAKE:TLE, FAKE:RE.
 */
export function fakeExecute(items) {
  return items.map((it) => {
    const src = String(it.source);
    const base = { stdout: '', stderr: '', compileOutput: '', message: '', timeMs: 12, memoryKb: 3100 };
    if (src.includes('FAKE:CE')) return { ...base, status: 'CE', compileOutput: 'error: expected ";"' };
    if (src.includes('FAKE:TLE')) return { ...base, status: 'TLE', timeMs: 2000 };
    if (src.includes('FAKE:RE')) return { ...base, status: 'RE', stderr: 'Segmentation fault' };
    const out = it.expectedOutput ?? it.stdin ?? '';
    return { ...base, status: 'OK', stdout: src.includes('FAKE:WA') ? `${out}x` : out };
  });
}
