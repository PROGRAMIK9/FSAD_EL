# API overview

Base URL: `/api`. JSON responses use `{ "ok": true, "data": ... }`; failures use `{ "ok": false, "error": ... }`. Authenticated requests use an HttpOnly `accessToken` cookie. Lists accept `page` and `limit` where noted.

## Available routes

- `GET /health`
- `POST /auth/google`, `POST /auth/logout`, `GET /auth/me`
- Admin: `GET /admin/dashboard`, `GET|POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/import/preview`, `POST /admin/users/import`, `GET|POST /admin/departments`, `GET|POST /admin/academic-years`, `GET|POST /admin/semesters`, `GET|POST /admin/sections`, `POST /admin/subjects`, `PATCH /admin/subjects/:id/allocations`, `GET /admin/audit-logs`, `GET /admin/reports/grades.csv|xlsx`
- Subjects: `GET /subjects`, `GET /subjects/:id/students`
- Questions: `GET|POST /questions`
- Assessments: `GET|POST /assessments`, `GET|PATCH|DELETE /assessments/:id`, `POST /assessments/:id/publish|pause|resume|end`, `GET /assessments/:id/attempts`, `GET /assessments/:id/monitor` (teacher roster and proctoring events), `POST /assessments/:id/start`, `GET /assessments/:id/my-result` (student; per-question review once their grade is published), `GET /assessments/:id/results.csv|xlsx` (teacher, admin; results, per-question marks and summary sheets)
- Attempts: `GET /attempts/:id` (teacher response includes a per-question `items` breakdown), `PATCH /attempts/:id/answers`, `POST /attempts/:id/proctoring-events|extend|force-submit|message|submit`
- Grades: `GET /grades/student`, `GET /grades/student/export.csv|xlsx`, `GET /grades/assessment/:id`, `POST /grades/:id/publish|review`, `PATCH /grade-reviews/:id`
- Rooms: `POST /rooms`, `POST /rooms/join`
- Assignments: `GET|POST /assignments`, `POST /assignments/:id/submit` (authenticated, up to 20 MB with assignment-level MIME and size limits), `GET /assignments/:id/submissions`, `GET /assignments/submissions/:submissionId/download`, `PATCH /assignments/:id/submissions/:submissionId/evaluate`
- Assessment templates: `GET|POST /assessment-templates`, `DELETE /assessment-templates/:id`
- Announcements: `GET|POST /announcements`; notifications: `GET /notifications`, `PATCH /notifications/:id/read`; calendar `GET /calendar/events`.

Socket.IO authenticates with the session cookie. Supported controls include `room:join`, `room:start`, `room:pause`, and `room:end`; all room actions are checked against the persisted room and teacher assignment.

All production API endpoints require valid identities provisioned in MongoDB. There is no public account registration or frontend role assignment.

Quiz assessments are fixed at 10 marks. Question types are one-correct-answer MCQ and single-line fill-in; the server validates the question total and scores fill-in answers case-insensitively after trimming whitespace.
