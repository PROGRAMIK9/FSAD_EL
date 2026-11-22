# Architecture

RVCE Academic Hub is a MERN modular monolith: one npm workspace with a React client and an Express API that share one MongoDB database. The code runner (`runner/`) is a separate service because it needs Docker.

```text
React + Vite client ──HTTP (JSON, cookie session)──▶ Express API ──▶ MongoDB (Mongoose)
        ▲                                                │
        └────────────────Socket.IO───────────────────────┤
                                                         └─ code-run queue ──HTTP──▶ code runner ──▶ docker run (sandbox)
```

## Client (`client/`)

- **Stack:** React 18, React Router, Tailwind 3, Axios, Socket.IO client, Recharts, CodeMirror 6, Lucide icons, react-hook-form with zod.
- **Routes:** `src/routes.jsx` lazy-loads pages from `src/pages/<feature>/`. Each route can list the roles that may open it; the server still enforces access.
- **Shell:** `src/components/layout/AppShell.jsx` (sidebar, top bar). Navigation is in `src/components/layout/nav.js`.
- **Design system:** `src/components/ui/`. Tokens are CSS variables in `src/index.css`, mapped in `tailwind.config.js`, with a light and a dark palette and pastel tile colours. The fonts are Inter and Instrument Serif; brand assets are in `public/brand/`.
- **API client:** `src/lib/api.js` creates one Axios instance with `withCredentials`. It unwraps the `{ ok, data }` envelope and rejects with the server's error message.
- **Exam screen:** `src/pages/exam/`. Answers autosave through `useAnswers.js`, which keeps one request in flight per question, a localStorage backup and retries. `src/hooks/useProctoring.js` reports focus loss, fullscreen exits, clipboard use and duplicate tabs.
- **Coding:** `src/components/domain/CodeEditor.jsx` (CodeMirror, lazy-loaded) and `CodeWorkspace.jsx` (samples, custom input, Run and Submit). `src/lib/code.js` starts a run and waits for the result over the socket, polling as a fallback.
- **Paper import:** `src/lib/ocr.js` (pdf.js text layer, Tesseract OCR) and `src/lib/paper-parser.js`. Both run in the browser from same-origin assets under `/ocr/`.

## Server (`server/`)

- **Entry point:** `src/index.js` sets up Helmet (strict CSP), CORS with credentials, JSON parsing, cookies and rate limits. It mounts `/api`, attaches Socket.IO and serves `client/dist` in production. It also runs background sweeps: assessment schedule changes, expired attempts, and the code-run dispatcher.
- **Routes:** `src/routes/` holds one router per area: `assessments`, `attempts`, `questions`, `code`, `cie`, `electives` and `dashboard`, plus `api.js` for everything else. Request bodies are validated with zod, and every route except sign-in requires a session.
- **Services** (`src/services/`):

  | Service | Responsibility |
  |---|---|
  | `auth.js` | Google ID-token check, domain allowlist, first-sign-in student accounts, JWT sessions |
  | `grading.js` | Objective scoring and the per-question review, including code-run verdicts |
  | `attempts.js` | Submitting attempts exactly once and keeping the best grade; code answers are graded asynchronously |
  | `code-runner.js` | MongoDB-backed run queue, dispatcher, retries, stale-run requeue, scoring |
  | `sandbox.js` / `judge0.js` | Clients for the code runner and the optional Judge0; the fake judge used by tests |
  | `proctoring.js` | Which events count as warnings, and auto-submit at the limit |
  | `cie.js` | The CIE scheme: quizzes 20, tests 40, EL 40, lab 50 |
  | `assessment-lifecycle.js`, `assessment-schedule.js` | State transitions, pause and resume, rooms |
  | `notifications.js`, `realtime.js` | Stored notifications and Socket.IO emits |

## Data model

All schemas are in `server/src/models/index.js`. Schemas use timestamps; unique indexes back up route validation.

| Model | Purpose |
|---|---|
| `User` | Google identity, email, role, USN, department and semester, active/approval state |
| `Department`, `AcademicYear`, `Semester`, `Section` | Academic structure |
| `Subject` | Code, name, semester, syllabus, teachers and students (ID arrays for fast authorization), elective group |
| `Enrollment`, `TeacherAssignment` | Relationship history behind the subject arrays |
| `Question` | `single` (MCQ), `fill_blank` or `code`. A coding question has languages, starter code, time and memory limits, an output-matching mode, weighted test cases (sample or hidden) and a practice flag. |
| `Assessment` | `Quiz` or `Lab`. Holds the questions, a fixed `maxMarks` of 10, duration and window, availability mode (scheduled, instant or room), proctoring policy and `cieSlot` (`QUIZ1`, `QUIZ2` or `LAB_TEST`). |
| `Attempt` | Question and option order, saved answers (code answers are `{ language, source }`), deadline, proctoring events, score, `codeScore`, `gradingStatus` |
| `CodeRun` | One execution request: `run`, `submit`, `final` or `scratch`. Holds the source hash, status (queued, running, done or error), per-test results and the weighted score. |
| `Grade` | Best score per assessment and student, plus publication and corrections |
| `CieRecord` | Teacher-entered CIE components |
| `GradeReviewRequest`, `Room`, `Assignment`/`AssignmentSubmission`, `Announcement`, `Notification`, `AcademicCalendarEvent`, `AuditLog` | Supporting workflows |

## Quiz and lab workflow

1. **Questions.** A teacher allocated to a subject writes questions or imports them from a paper. MCQs need unique options and one correct key; fill-ins need an accepted answer. Coding questions need at least one language, at least one test case and at least one visible sample.
2. **Assessment.** A *Quiz* takes MCQ and fill-in questions; a *Lab* may also take coding questions. The selected marks must total exactly 10. A quiz can count as CIE Quiz 1 or Quiz 2, and a lab as the CIE lab test.
3. **Attempt.**
   - The student must be enrolled and within the window, and in the room for room-mode assessments.
   - The server sets the deadline and shuffles the order. The paper never contains correct answers or hidden test data.
   - Answers autosave as the student works.
4. **Running code during an attempt.**
   - *Run* executes the sample tests, plus any custom input.
   - *Submit code* executes every test, but students only see whether hidden tests passed, not their data.
   - Each user has one run in flight at a time, and each session is limited per time window.
5. **Submission.**
   - The attempt is submitted manually, at the time limit, when the assessment ends, by the teacher, or at the proctoring limit. It happens exactly once.
   - Objective answers are scored immediately. Fill-ins are compared after trimming whitespace and ignoring letter case.
   - Each code answer is judged against every test. The result of the last *Submit code* of identical code is reused.
   - The attempt shows *Grading…* until all code runs finish. Then the grade is recorded, keeping the best attempt.
6. **Results.** Teachers publish grades. Students see their published results with a per-question review, and may ask for a clarification. CIE quiz and lab-test marks fill the CIE sheet.

Code marks for a question are `marks × passed weight / total weight`. A test passes when the program exits normally and its output matches the expected output in the question's matching mode: `trim` ignores trailing whitespace, `tokens` compares words, and `exact` compares byte for byte.

## Code execution

- **Queue:** runs are `CodeRun` documents. The dispatcher in `code-runner.js` claims queued runs atomically and caps runs in flight (`JUDGE_MAX_INFLIGHT`), so a burst at the end of an exam waits in MongoDB. It retries failures and requeues runs left behind by a crashed process.
- **Runner:** `runner/server.js` limits how many containers run at once. Each submission gets one throwaway container with no network, the `nobody` user, all capabilities dropped and a read-only root. CPU, memory, process and output limits apply. Inside, the harness compiles once and runs every test. See [runner/README.md](../runner/README.md).
- **Judge selection:**

  | `JUDGE_MODE` | Used when |
  |---|---|
  | `runner` | `RUNNER_URL` is set |
  | `judge0` | `JUDGE0_URL` is set; Judge0 needs a cgroup v1 host |
  | `fake` | Tests and development without a runner. Code never runs. |
  | `off` | Production without a runner |

## Identity and security

- **Sign-in:** `POST /api/auth/google` verifies the Google ID token, requires a verified email on an allowed domain (or in `ALLOWED_EMAILS`), creates students on first sign-in and sets an HTTP-only `accessToken` cookie (a JWT).
- **Authorization:** role middleware (`admin`, `teacher`, `student`) gates routes. Handlers then check ownership: teacher allocation, enrollment, the attempt's owner, room membership. Socket.IO uses the same session.
- **Hardening:** Helmet with a same-origin CSP, credentialed CORS, a 1 MB JSON limit, and rate limits per session, per IP for sign-in, and per session for code runs. Uploads are checked for size and MIME type. Audit logs cover administrative and grading actions.
- **Isolation:** student code never runs on the API host.

## API conventions

- Base path: `/api`.
- Success responses are `{ "ok": true, "data": … }`; failures are `{ "ok": false, "error": … }`. Zod failures include `details`.
- The endpoint list is in [API.md](API.md).
