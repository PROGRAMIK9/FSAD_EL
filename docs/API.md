# API overview

Base URL: `/api`. JSON responses use `{ "ok": true, "data": ... }`; failures use `{ "ok": false, "error": ... }`. Authenticated requests use an HttpOnly `accessToken` cookie. Lists accept `page` and `limit` where noted.

## Available routes

- `GET /health`
- `POST /auth/google`, `POST /auth/logout`, `GET /auth/me`
- Admin: `GET /admin/dashboard`, `GET|POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/import/preview`, `POST /admin/users/import`, `GET|POST /admin/departments`, `GET|POST /admin/academic-years`, `GET|POST /admin/semesters`, `GET|POST /admin/sections`, `POST /admin/subjects`, `PATCH /admin/subjects/:id/allocations`, `GET /admin/audit-logs`, `GET /admin/reports/grades.csv|xlsx`
- Subjects: `GET /subjects`, `GET /subjects/:id/students`
- Questions: `GET|POST /questions`, `POST /questions/bulk` (`{ subject, questions: [...] }`, at most 100, all-or-nothing; a 400 returns `data.errors: [{ index, error }]`)
- Assessments: `GET|POST /assessments`, `GET|PATCH|DELETE /assessments/:id`, `POST /assessments/:id/publish|pause|resume|end`, `GET /assessments/:id/attempts`, `GET /assessments/:id/monitor` (teacher roster and proctoring events), `POST /assessments/:id/start`, `GET /assessments/:id/my-result` (student; per-question review once their grade is published), `GET /assessments/:id/results.csv|xlsx` (teacher, admin; results, per-question marks and summary sheets)
- Attempts: `GET /attempts/:id` (teacher response includes a per-question `items` breakdown), `PATCH /attempts/:id/answers`, `POST /attempts/:id/proctoring-events|extend|force-submit|message|submit`
- Code execution: `GET /code/languages`; `POST /code/run` (`{ questionId?, attemptId?, language, source, stdin? }`: the sample tests plus optional custom input; without `questionId` the code only runs on `stdin`); `POST /code/submit` (every test); both return `202 { runId }`. `GET /code/runs/:id` polls a run; the owner also receives socket event `code:result { runId, status }`. Students never see the input or output of hidden tests. One run at a time per user, 30 per session per 5 minutes. `503` when no judge is configured.
- Practice: `GET /practice/questions`, `GET /practice/questions/:id` (coding questions marked for practice in the caller's subjects); `POST /attempts/:id/regrade-code` (teacher: judge a submitted attempt's code again)
- Grades: `GET /grades/student`, `GET /grades/student/export.csv|xlsx`, `GET /grades/assessment/:id`, `POST /grades/:id/publish|review`, `PATCH /grade-reviews/:id`
- Rooms: `POST /rooms`, `POST /rooms/join`
- Assignments: `GET|POST /assignments`, `POST /assignments/:id/submit` (authenticated, up to 20 MB with assignment-level MIME and size limits), `GET /assignments/:id/submissions`, `GET /assignments/submissions/:submissionId/download`, `PATCH /assignments/:id/submissions/:submissionId/evaluate`
- Assessment templates: `GET|POST /assessment-templates`, `DELETE /assessment-templates/:id`
- Announcements: `GET|POST /announcements`; notifications: `GET /notifications`, `PATCH /notifications/:id/read`; calendar `GET /calendar/events`.

Socket.IO authenticates with the session cookie. Supported controls include `room:join`, `room:start`, `room:pause`, and `room:end`; all room actions are checked against the persisted room and teacher assignment.

All API endpoints except sign-in require a session. A verified Google account from an allowed domain (or the `ALLOWED_EMAILS` list) that signs in for the first time is created as an active **student**; only administrators can change a role (`PATCH /admin/users/:id` with `role`), and an administrator cannot remove their own admin access.

Assessments are fixed at 10 marks. Question types are one-correct-answer MCQ, single-line fill-in and coding (`type: 'code'`). The server validates the question total and scores fill-in answers case-insensitively after trimming whitespace. Coding questions may only appear in `category: 'Lab'` assessments, which can count as the CIE lab test (`cieSlot: 'LAB_TEST'`).

A coding answer is saved as `{ language: 'c'|'cpp'|'java'|'python', source }` (at most 64 KB). When an attempt is submitted, each code answer is judged against every test case. The result of the last `POST /code/submit` of identical code is reused. The attempt's `gradingStatus` stays `pending` until all code answers are judged; the grade is then recorded and `monitor:submitted` is emitted again with the final score. A test case's marks are `marks × weight / total weight`, and each test passes when the program exits normally and its output matches (`trim`: trailing whitespace ignored; `tokens`: whitespace-separated words; `exact`).
