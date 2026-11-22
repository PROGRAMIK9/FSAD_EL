/**
 * Client for the code runner (../../../runner): one request per run. The runner compiles once
 * and runs every test in a throwaway Docker container (works on cgroup v2 hosts).
 *
 * RUNNER_URL         e.g. http://10.0.0.5:2359
 * RUNNER_AUTH_TOKEN  the runner's RUNNER_AUTH_TOKEN, sent as X-Auth-Token
 */

/** Runner limits from the Judge0-style limits that limitsFor() builds. */
export function runnerLimits(limits = {}) {
  return {
    cpuMs: Math.round((limits.cpu_time_limit ?? 2) * 1000),
    wallMs: Math.round((limits.wall_time_limit ?? 5) * 1000),
    memoryMb: Math.round((limits.memory_limit ?? 256 * 1024) / 1024),
    outputKb: limits.max_file_size ?? 1024,
  };
}

/**
 * Executes a run's items (all share language, source and limits) and returns one output per
 * item: { status: OK|TLE|MLE|OLE|RE|CE, stdout, stderr, compileOutput, timeMs, memoryKb }.
 */
export async function runSandbox(items) {
  if (!items.length) return [];
  const { language, source, limits } = items[0];
  const job = { language, source, tests: items.map((it) => it.stdin ?? ''), limits: runnerLimits(limits) };
  const base = (process.env.RUNNER_URL || '').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.RUNNER_AUTH_TOKEN) headers['X-Auth-Token'] = process.env.RUNNER_AUTH_TOKEN;
  // The runner may queue the job behind others, then compile and run every test.
  const res = await fetch(`${base}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`Runner ${res.status}: ${text.slice(0, 200)}`), { status: res.status });
  }
  const out = await res.json();
  if (!out.compileOk)
    return items.map(() => ({
      status: 'CE',
      stdout: '',
      stderr: '',
      compileOutput: out.compileOutput || 'Compilation failed',
      timeMs: null,
      memoryKb: null,
    }));
  return items.map((_, i) => {
    const r = out.results?.[i];
    if (!r)
      return {
        status: 'IE',
        stdout: '',
        stderr: 'No result from the runner',
        compileOutput: '',
        timeMs: null,
        memoryKb: null,
      };
    return {
      status: r.status,
      stdout: r.stdout || '',
      stderr: r.stderr || '',
      compileOutput: out.compileOutput || '',
      timeMs: r.timeMs ?? null,
      memoryKb: r.memoryKb ?? null,
    };
  });
}
