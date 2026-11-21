import { api } from './api.js';
import { getSocket } from './socket.js';

/** Languages the judge supports, with the starter code shown in an empty editor. */
export const LANGUAGES = {
  c: {
    label: 'C',
    starter: '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n',
  },
  cpp: {
    label: 'C++',
    starter:
      '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    \n    return 0;\n}\n',
  },
  java: {
    label: 'Java',
    starter:
      'import java.util.*;\n\n// The class must be named Main.\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        \n    }\n}\n',
  },
  python: {
    label: 'Python 3',
    starter: 'import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    \n\nmain()\n',
  },
};
export const LANGUAGE_KEYS = Object.keys(LANGUAGES);

export const starterFor = (language, starters = {}) =>
  starters?.[language] || LANGUAGES[language]?.starter || '';

export const VERDICTS = {
  AC: { label: 'Accepted', tone: 'success' },
  WA: { label: 'Wrong answer', tone: 'danger' },
  TLE: { label: 'Time limit exceeded', tone: 'warn' },
  MLE: { label: 'Memory limit exceeded', tone: 'warn' },
  CE: { label: 'Compilation error', tone: 'danger' },
  RE: { label: 'Runtime error', tone: 'danger' },
  IE: { label: 'Judge error', tone: 'neutral' },
  OK: { label: 'Ran', tone: 'primary' },
};
export const verdictOf = (status) => VERDICTS[status] || { label: status || 'Unknown', tone: 'neutral' };

/** One-line summary of a finished run. */
export function summarize(run) {
  if (!run) return null;
  if (run.status === 'error')
    return { tone: 'danger', text: run.error || 'The judge could not run this code.' };
  const tests = (run.results || []).filter((r) => !r.custom);
  const ce = run.results?.find((r) => r.status === 'CE');
  if (ce) return { tone: 'danger', text: 'Compilation error' };
  if (!tests.length) return { tone: 'primary', text: 'Finished' };
  const passed = tests.filter((r) => r.passed).length;
  return {
    tone: passed === tests.length ? 'success' : passed ? 'warn' : 'danger',
    text: `${passed}/${tests.length} test${tests.length === 1 ? '' : 's'} passed`,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts a run (`kind`: 'run' | 'submit') and resolves with the finished run. Listens for the
 * server's socket push and polls as a fallback. `onProgress` receives intermediate states.
 */
export async function executeCode(kind, body, { onProgress, signal } = {}) {
  const { runId } = await api.post(`/code/${kind}`, body);
  const socket = getSocket();
  let wake;
  const listener = (msg) => msg?.runId === runId && wake?.();
  socket.on('code:result', listener);
  try {
    let wait = 800;
    for (let i = 0; i < 200; i++) {
      if (signal?.aborted) throw new Error('Cancelled');
      const run = await api.get(`/code/runs/${runId}`);
      onProgress?.(run);
      if (run.status === 'done' || run.status === 'error') return run;
      await Promise.race([sleep(wait), new Promise((r) => (wake = r))]);
      wait = Math.min(4000, Math.round(wait * 1.4));
    }
    throw new Error('The judge is taking too long. Try again in a minute.');
  } finally {
    socket.off('code:result', listener);
  }
}
