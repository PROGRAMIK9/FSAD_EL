/**
 * Code runner: compiles and runs untrusted C, C++, Java and Python in throwaway Docker
 * containers (no network, unprivileged user, read-only root, CPU/memory/process limits).
 * Works on cgroup v2 hosts. No npm dependencies.
 *
 *   POST /execute  { language, source, tests: [stdin...], limits: { cpuMs, wallMs, memoryMb } }
 *                  -> { compileOk, compileOutput, results: [{ status, stdout, stderr, timeMs, memoryKb }] }
 *   GET  /health   -> { ok, docker, image, running, queued }
 *
 * Env: PORT (2359), RUNNER_AUTH_TOKEN (required unless RUNNER_INSECURE=true),
 *      RUNNER_CONCURRENCY (CPU count), RUNNER_MAX_QUEUE (500), SANDBOX_IMAGE (fsad-sandbox:latest),
 *      RUNNER_DOCKER_RUNTIME (e.g. runsc for gVisor), DOCKER_BIN (docker).
 */
import http from 'node:http';
import os from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';

const PORT = Number(process.env.PORT) || 2359;
const TOKEN = process.env.RUNNER_AUTH_TOKEN || '';
const CONCURRENCY = Number(process.env.RUNNER_CONCURRENCY) || os.availableParallelism?.() || os.cpus().length;
const MAX_QUEUE = Number(process.env.RUNNER_MAX_QUEUE) || 500;
const IMAGE = process.env.SANDBOX_IMAGE || 'fsad-sandbox:latest';
const DOCKER = process.env.DOCKER_BIN || 'docker';
const RUNTIME = process.env.RUNNER_DOCKER_RUNTIME || '';
const LANGUAGES = new Set(['c', 'cpp', 'java', 'python']);
const MAX_BODY = 20 * 1024 * 1024;

if (!TOKEN && process.env.RUNNER_INSECURE !== 'true') {
  console.error('Set RUNNER_AUTH_TOKEN (or RUNNER_INSECURE=true for local development only).');
  process.exit(1);
}

// ---- concurrency: at most CONCURRENCY containers at once, the rest wait in order ----
let running = 0;
const waiting = [];
const acquire = () =>
  new Promise((resolve, reject) => {
    if (running < CONCURRENCY) {
      running += 1;
      return resolve();
    }
    if (waiting.length >= MAX_QUEUE)
      return reject(Object.assign(new Error('Runner queue is full'), { status: 503 }));
    waiting.push(resolve);
  });
const release = () => {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
};

const clampInt = (v, min, max, dflt) => Math.min(max, Math.max(min, Math.round(Number(v) || dflt)));

/** Validates a job and fills in limits. Exported for tests. */
export function normalizeJob(body) {
  if (!body || !LANGUAGES.has(body.language))
    throw Object.assign(new Error('Unknown language'), { status: 400 });
  if (typeof body.source !== 'string' || !body.source.length || body.source.length > 64 * 1024)
    throw Object.assign(new Error('Source must be 1 byte to 64 KB'), { status: 400 });
  const tests = Array.isArray(body.tests) ? body.tests.map((t) => String(t ?? '')) : [];
  if (tests.length > 60) throw Object.assign(new Error('At most 60 tests'), { status: 400 });
  const l = body.limits || {};
  const limits = {
    cpuMs: clampInt(l.cpuMs, 200, 15_000, 2000),
    wallMs: clampInt(l.wallMs, 500, 30_000, 5000),
    memoryMb: clampInt(l.memoryMb, 32, 1024, 256),
    outputKb: clampInt(l.outputKb, 64, 4096, 1024),
  };
  return { language: body.language, source: body.source, tests, limits };
}

/** `docker run` arguments for one submission. Exported for tests. */
export function dockerArgs(job, name) {
  // Room for the compiler (g++/javac) on top of the program's own limit.
  const memory = Math.max(job.limits.memoryMb, 256) + 512;
  return [
    'run',
    '--rm',
    '-i',
    '--name',
    name,
    '--network',
    'none',
    '--cpus',
    '1',
    '--memory',
    `${memory}m`,
    '--memory-swap',
    `${memory}m`,
    '--pids-limit',
    '64',
    '--read-only',
    '--tmpfs',
    '/box:rw,exec,nosuid,size=64m,uid=65534,gid=65534,mode=700',
    '--tmpfs',
    '/tmp:rw,nosuid,size=16m,uid=65534,gid=65534',
    '--user',
    '65534:65534',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--ulimit',
    'nofile=256:256',
    '--log-driver',
    'none',
    ...(RUNTIME ? ['--runtime', RUNTIME] : []),
    IMAGE,
  ];
}

function execute(job) {
  const name = `sbx-${randomBytes(6).toString('hex')}`;
  // compile (≤30 s) + every test at its wall limit + container start
  const deadline = 40_000 + job.tests.length * (job.limits.wallMs + 200);
  return new Promise((resolve, reject) => {
    const child = spawn(DOCKER, dockerArgs(job, name), { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      execFile(DOCKER, ['kill', name], () => {});
      reject(Object.assign(new Error('Sandbox timed out'), { status: 504 }));
    }, deadline);
    child.stdout.on('data', (d) => {
      if (out.length < 8 * 1024 * 1024) out += d;
    });
    child.stderr.on('data', (d) => {
      if (err.length < 64 * 1024) err += d;
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        return resolve(JSON.parse(out));
      } catch {
        // 137: the container itself was killed, almost always by the cgroup memory limit.
        if (code === 137)
          return resolve({
            compileOk: true,
            compileOutput: '',
            results: job.tests.map(() => ({
              status: 'MLE',
              stdout: '',
              stderr: 'Memory limit exceeded',
              timeMs: null,
              memoryKb: null,
            })),
          });
        reject(
          Object.assign(new Error(`Sandbox failed (exit ${code}): ${err.slice(0, 300)}`), { status: 500 }),
        );
      }
    });
    child.stdin.end(JSON.stringify(job));
  });
}

function authorized(req) {
  if (!TOKEN) return true;
  const given = Buffer.from(String(req.headers['x-auth-token'] || ''));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

const reply = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const dockerOk = () =>
  new Promise((resolve) =>
    execFile(DOCKER, ['image', 'inspect', '--format', '{{.Id}}', IMAGE], (e) => resolve(!e)),
  );

export const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      const image = await dockerOk();
      return reply(res, image ? 200 : 503, {
        ok: image,
        image: IMAGE,
        imagePresent: image,
        running,
        queued: waiting.length,
        concurrency: CONCURRENCY,
      });
    }
    if (req.method !== 'POST' || req.url !== '/execute') return reply(res, 404, { error: 'Not found' });
    if (!authorized(req)) return reply(res, 401, { error: 'Unauthorized' });
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) return reply(res, 413, { error: 'Request too large' });
    }
    const job = normalizeJob(JSON.parse(raw || '{}'));
    await acquire();
    try {
      reply(res, 200, await execute(job));
    } finally {
      release();
    }
  } catch (e) {
    if (!res.headersSent)
      reply(res, e.status || (e instanceof SyntaxError ? 400 : 500), { error: e.message });
  }
});

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () =>
    console.log(
      `Code runner on :${PORT} (image ${IMAGE}, ${CONCURRENCY} at a time${RUNTIME ? `, runtime ${RUNTIME}` : ''})`,
    ),
  );
}
