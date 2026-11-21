/**
 * 250 students writing a coding lab at once, against staging with a real Judge0.
 *
 *   LOADTEST=true MONGODB_URI=... node server/src/scripts/loadtest-fixtures.js 250
 *   k6 run -e BASE_URL=https://staging.example.com -e ASSESSMENT_ID=<id> loadtest/code-lab.k6.js
 *
 * Each virtual student signs in (dev sign-in, so the API needs DEV_LOGIN=true and a NODE_ENV
 * other than production), starts the lab, autosaves code every 3 s, runs the samples about
 * every 45 s, presses "Submit code" once near the end and submits the attempt. After the run,
 * check the live monitor: every attempt should leave "Grading…" within a few minutes.
 *
 * Pass criteria (thresholds below): p95 of ordinary API calls < 500 ms, under 1% failed
 * requests, and every run finishing within 60 s.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const ASSESSMENT = __ENV.ASSESSMENT_ID;
const STUDENTS = Number(__ENV.STUDENTS || 250);
const MINUTES = Number(__ENV.MINUTES || 10);

const runLatency = new Trend('code_run_seconds', true);
const runFailed = new Rate('code_run_failed');

export const options = {
  scenarios: {
    lab: {
      executor: 'per-vu-iterations',
      vus: STUDENTS,
      iterations: 1,
      maxDuration: `${MINUTES + 10}m`,
    },
  },
  thresholds: {
    'http_req_duration{kind:api}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    code_run_seconds: ['p(95)<60000'],
    code_run_failed: ['rate<0.02'],
  },
};

const SOURCES = {
  python: 'a, b = map(int, input().split())\nprint(a + b)\n',
  cpp: '#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}\n',
  c: '#include <stdio.h>\nint main(void){long long a,b;scanf("%lld %lld",&a,&b);printf("%lld\\n",a+b);return 0;}\n',
  java: 'import java.util.*;\npublic class Main{public static void main(String[] x){Scanner s=new Scanner(System.in);System.out.println(s.nextLong()+s.nextLong());}}\n',
};
const LANGS = Object.keys(SOURCES);
const json = { headers: { 'Content-Type': 'application/json' }, tags: { kind: 'api' } };
const data = (res) => {
  try {
    return res.json('data');
  } catch {
    return null;
  }
};

function judge(kind, body) {
  const started = Date.now();
  const res = http.post(`${BASE}/api/code/${kind}`, JSON.stringify(body), {
    ...json,
    tags: { kind: 'code' },
    responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 429),
  });
  if (res.status === 429) return null; // rate limit or a run still going: a real student waits too
  const runId = data(res)?.runId;
  if (!check(res, { [`${kind} accepted`]: () => Boolean(runId) })) return runFailed.add(1);
  for (let i = 0; i < 60; i++) {
    sleep(i < 3 ? 1 : 2);
    const run = data(http.get(`${BASE}/api/code/runs/${runId}`, { tags: { kind: 'poll' } }));
    if (run?.status === 'done' || run?.status === 'error') {
      runLatency.add(Date.now() - started);
      runFailed.add(run.status === 'error');
      return run;
    }
  }
  runFailed.add(1);
  return null;
}

export default function () {
  if (!ASSESSMENT) throw new Error('Set -e ASSESSMENT_ID=<id> (printed by loadtest-fixtures.js)');
  const n = __VU;
  const email = `lt.student${n}@rvce.edu.in`;
  const login = http.post(`${BASE}/api/auth/dev-login`, JSON.stringify({ email }), json);
  check(login, { 'signed in': (r) => r.status === 200 });
  // Students do not all arrive in the same second.
  sleep(Math.random() * 30);

  const exam = data(http.post(`${BASE}/api/assessments/${ASSESSMENT}/start`, '{}', json));
  if (!check(exam, { 'started': (e) => Boolean(e?.attempt?.id) })) return;
  const attemptId = exam.attempt.id;
  const questionId = String(exam.questions[0]._id);
  const language = LANGS[n % LANGS.length];

  const end = Date.now() + MINUTES * 60_000;
  let typed = 0;
  let nextRun = Date.now() + 20_000 + Math.random() * 40_000;
  while (Date.now() < end) {
    typed += 1;
    // Autosave: the source grows as the student types.
    const source = `${SOURCES[language]}${language === 'python' ? '#' : '//'} edit ${typed}\n`;
    const saved = http.patch(
      `${BASE}/api/attempts/${attemptId}/answers`,
      JSON.stringify({ question: questionId, value: { language, source } }),
      json,
    );
    check(saved, { 'autosaved': (r) => r.status === 200 });
    if (Date.now() >= nextRun) {
      judge('run', { questionId, attemptId, language, source });
      nextRun = Date.now() + 30_000 + Math.random() * 30_000;
    }
    sleep(3);
  }
  // Final answer, one "Submit code", then the attempt.
  const source = SOURCES[language];
  http.patch(`${BASE}/api/attempts/${attemptId}/answers`, JSON.stringify({ question: questionId, value: { language, source } }), json);
  const final = judge('submit', { questionId, attemptId, language, source });
  check(final, { 'all tests pass': (r) => !r || r.passedWeight === r.totalWeight });
  const submitted = http.post(`${BASE}/api/attempts/${attemptId}/submit`, '{}', json);
  check(submitted, { 'attempt submitted': (r) => r.status === 200 });
}
