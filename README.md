# RVCE Academic Hub

RVCE Academic Hub is a role-aware academic management application built as a MERN modular monolith. It combines academic structure, subject allocation, a small quiz workflow, grades, assignments, announcements, notifications, calendar events, room-based quizzes, and administrative reporting.

This guide is intended to help a developer orient themselves in the repository, run it locally, and trace how the main data and request flows work. For the concise endpoint inventory see [docs/API.md](docs/API.md); for deployment and operations see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); for milestone history see [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md).

## Quick start

```bash
./run.sh
```

On the first run this creates a local `.env` (random JWT secret, local MongoDB), installs dependencies, starts MongoDB (a local `mongod` with data in `.data/`, or Docker Compose when `mongod` is not installed), loads the MCA semester III subjects, syllabus and quiz drafts if the database is empty, and starts the API on <http://localhost:4000/api> and the app on <http://localhost:5173>. Sign in with an RVCE Google account (set `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` in `.env`). Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop; the MongoDB started by the script stops with it.

| Command | What it does |
|---|---|
| `./run.sh` | Set up if needed, start MongoDB, seed an empty database, run API and client |
| `./run.sh setup` | Create `.env` and install dependencies only |
| `./run.sh seed` | Load the MCA semester III subjects, syllabus, question bank and quiz drafts |
| `./run.sh test` | Run the server tests |
| `./run.sh build` | Build the client into `client/dist` |
| `./run.sh stop` | Stop a MongoDB left running by the script |

Requirements: Node.js 20+, and either MongoDB 7 (`mongod`) or Docker. The generated `.env` is for local development only and keeps the sign-in picker (`DEV_LOGIN`) off, because the database holds a real administrator account; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production settings.

**Exporting results.** Teachers download a quiz's results from *Evaluation* or the quiz report (**Export → Excel workbook / CSV**). The workbook has a results sheet, a per-question marks sheet and a summary. Students download their published grades from *My grades*; admins download every published grade from the dashboard.

The project report (LaTeX, Times New Roman 12 pt) is in [docs/report](docs/report).

## Product scope

- Google sign-in for the institution's accounts. The default allowed domain is `rvce.edu.in`; explicit email exceptions can be configured. A first sign-in creates the account as a student automatically; administrators promote teachers and admins.
- Three application roles: `admin`, `teacher`, and `student`.
- Academic organization: departments, academic years, semesters, sections, subjects, teacher assignments, and student enrollments.
- Quizzes are fixed at **10 marks**. Supported question types are one-correct-answer multiple choice and single-line fill-in-the-blank. A quiz can be created only when the selected questions total exactly 10 marks. Fill-in answers are compared after trimming outer whitespace and ignoring letter case.
- Quiz attempts are timed and autosaved. Teachers can schedule, publish, pause, resume, or end assessments. Results are automatically scored and can be published to students.
- Subject assignments support file submissions and teacher evaluation. Announcements, notifications, calendar events, audit records, and grade clarification requests support the surrounding academic workflow.
- A room-code flow lets eligible students join a teacher-controlled live quiz room.

There is no configurable CIE weighting/consolidation scheme in the current product scope. Assignment grading is separate from the fixed 10-mark quiz flow.

## Technology and architecture

```text
React + Vite browser client
        │ HTTP (JSON, cookie session)       │ Socket.IO
        ▼                                   ▼
Express API ─────────────────────────── Socket.IO handlers
        │
        ▼
MongoDB (Mongoose models)
```

The repository is one npm workspace with two deployable applications. The server is a modular monolith: routes, services, models, middleware, and utilities are separated by responsibility, but run in one Node process and share one MongoDB database. The browser calls the API directly; it does not access MongoDB.

### Repository map

```text
.
├── client/
│   ├── src/App.jsx                 Role-aware screens and route composition
│   ├── src/context/AuthContext.jsx Session bootstrap and current user
│   ├── src/lib/api.js              Axios API client and response unwrapping
│   ├── src/lib/google.js           Google Identity Services script loader
│   ├── src/main.jsx                React entry point
│   └── vite.config.js              Vite config; reads root .env
├── server/
│   ├── src/index.js                Express, HTTP, Socket.IO and process startup
│   ├── src/config/db.js            MongoDB connection
│   ├── src/models/index.js         Mongoose schemas, indexes and model exports
│   ├── src/routes/api.js           REST routes, validation and authorization
│   ├── src/middleware/             Authentication and assignment upload handling
│   ├── src/services/               Auth, grading, attempts, notifications, lifecycle
│   ├── src/utils/                  Audit and CSV parsing helpers
│   ├── src/scripts/seed.js         Real MCA semester III data (from src/data/)
│   └── test/                       Node test-runner tests
├── docs/
│   ├── API.md                      Endpoint overview
│   ├── DEPLOYMENT.md               Local and deployment notes
│   └── DEVELOPMENT_PLAN.md         Delivery plan and architecture notes
├── Dockerfile                      One image: builds the client, runs the API (serves the client)
├── render.yaml                     Render blueprint (one web service)
├── docker-compose.yml              MongoDB + the app image
├── .env.example                    Environment variable template
└── package.json                    npm workspace scripts
```

### Client

The client uses React 18, React Router, Axios, Socket.IO Client, Recharts, Lucide icons, and `react-hot-toast`. `client/src/App.jsx` currently contains the app shell, role-aware navigation, routes, screens, and modal forms. The shell waits for `AuthContext` to check `/auth/me`; signed-out users see the Google login screen. Navigation entries can be restricted by role, while the server remains responsible for enforcing access.

`client/src/lib/api.js` creates one Axios instance using `VITE_API_URL` and `withCredentials: true`. Its response interceptor unwraps the server's `{ok,data}` response envelope and turns API error responses into rejected promises. Screens use that client for data loading and mutations. Quiz attempts keep the server's answer list in local component state and send updates to the autosave endpoint as a student responds.

The client uses a same-site HTTP-only cookie for browser sessions; application JavaScript does not read the session token. Google Identity Services returns a credential to the login screen, which posts it to the server. The client does not assign roles or create accounts.

### Server

`server/src/index.js` configures Express security headers, CORS with credentials, JSON parsing, cookies, rate limits, the health endpoint, and the `/api` router. It creates the HTTP server and Socket.IO server together. Outside test mode, it connects to MongoDB, starts listening, and runs a periodic sweep that finalizes expired quiz attempts.

`server/src/routes/api.js` is the REST boundary. It parses request bodies with Zod, checks authenticated identity and role, applies domain-specific ownership/enrollment checks, calls models and services, writes audit entries, and returns the API envelope. The shared error handler formats validation errors, duplicate-key errors, upload errors, and server errors.

Services hold logic shared across routes or process events:

- `auth.js`: verifies Google ID tokens, checks verified email/domain/allowlist, finds the account (creating an active student on first sign-in), and signs a JWT.
- `grading.js`: compares answers and calculates objective quiz marks.
- `attempts.js`: finalizes submitted attempts, creates/updates grades, and sweeps expired attempts.
- `assessment-lifecycle.js`: pauses/resumes timers, updates room state, and finalizes attempts when a quiz ends.
- `notifications.js`: persists notification rows and emits them to the recipient's Socket.IO user room.
- `utils/audit.js`: stores actor/action/entity/IP information for audited operations.
- `utils/csv.js`: parses quoted CSV fields used by administrator bulk import.

## Data model

All schemas are in `server/src/models/index.js`. Mongoose schemas use timestamps (`createdAt` and `updatedAt`) and disable the default `__v` version key. ObjectId references connect records; the server populates selected references for response views. Unique indexes provide a final duplicate guard in addition to route validation.

| Model | Purpose and important fields |
|---|---|
| `User` | Google identity and provisioned profile: `googleId`, unique lowercase `email`, `name`, role, optional USN/department/semester/section, `isActive`, `approvalStatus`, last login. |
| `Department` | Named academic unit with unique uppercase `code` and active flag. |
| `AcademicYear` | Label, optional date range, active flag, archive date. |
| `Semester` | Academic year reference, number, display name, optional dates and active flag. A year/number pair is unique. |
| `Section` | Department, academic year, semester, and section name. The combination is unique. |
| `Subject` | Name/code, department, semester/year, credits, coordinator, assigned teacher IDs and enrolled student IDs. Subject code/year is unique. |
| `Enrollment` | Student-to-subject relation, year/section and active flag. Student/subject is unique. |
| `TeacherAssignment` | Teacher-to-subject relation, assignment role, active state, and date range. Teacher/subject/role is unique. |
| `Question` | Quiz question owned by a subject and creator. `type` is `single` or `fill_blank`; stores marks, topic/difficulty, MCQ options, and the answer used for scoring. Archived questions are excluded from new quizzes. |
| `Assessment` | A quiz for a subject: creator, title, state, selected question IDs, fixed `maxMarks: 10`, duration, optional opening/closing times, availability mode, attempt allowance, and randomization settings. Category is `Quiz`. |
| `Attempt` | A student's attempt: question order, randomized option-key order, saved answers, lifecycle state, start/deadline/submission times, score, and proctoring events. An attempt number is unique per student and quiz. |
| `Grade` | A student's score for an assessment, maximum marks, source attempt, publication time, and optional correction metadata. Assessment/student is unique. |
| `GradeReviewRequest` | A student's request to clarify a published grade and the teacher's response/resolution. |
| `Room` | Unique join code, quiz, teacher, eligible students, participants, status, and expiry. |
| `Assignment` / `AssignmentSubmission` | Separate file-based assignment workflow and submission metadata, evaluation marks, and feedback. Submission is unique per assignment/student. |
| `Announcement` | Subject-scoped title/body and publishing author/time. |
| `Notification` | Recipient, title/body/link, and read time. |
| `AcademicCalendarEvent` | Calendar title, optional subject, start/end, type, and creator. Quiz schedules and assignment deadlines can create events. |
| `AuditLog` | Actor, action, entity type/ID, details, and request IP for traceability. |
| `AssessmentTemplate` / `QuestionBank` | Supporting storage models for reusable assessment configuration and grouped subject questions. |

MongoDB is the source of truth. Subject documents also contain teacher and student ID arrays for efficient authorization and listing; enrollment and teacher-assignment documents preserve the corresponding relationship history/workflow. Mutations that change allocations update both representations in the route layer.

## Quiz and grading workflow

### Creating a quiz

1. A teacher creates questions under a subject. The teacher must be allocated to that subject. An MCQ needs at least two uniquely keyed, non-empty options and a correct option key. A fill-in question needs a non-empty accepted answer.
   Questions can also be imported from a question paper: **Question bank → Import paper** accepts a PDF (up to 10 pages) or a photo/scan. The paper is read entirely in the browser: a PDF's text layer is used directly, and scanned pages and images go through Tesseract OCR. The tesseract worker, WASM core and English model, and the pdf.js worker, fonts and CMaps, are served from the app's own origin under `/ocr/` (copied by `vite-plugin-static-copy`), so the same-origin CSP only adds `'wasm-unsafe-eval'` and `worker-src 'self'`. `client/src/lib/paper-parser.js` turns the text into drafts. It recognises numbered questions and sub-parts, lettered options, marks annotations, blanks and answer keys. The teacher marks the answers, fixes misreads or removes long-answer questions, then imports them all through `POST /questions/bulk`.
2. The teacher creates a quiz with at least one question, a title, duration, availability mode, and optional schedule. The server checks teacher allocation, question ownership by subject, archived status, unique question IDs, and supported types.
3. The server sums the selected question marks. It accepts the quiz only when the sum is exactly 10 and `maxMarks` is 10. The client shows the running sum and disables submission until it equals 10.
4. The quiz starts as scheduled or draft depending on its availability mode. Publishing makes a scheduled quiz available at its configured time, makes an instant quiz available immediately, or prepares a room-code quiz.

### Taking and scoring a quiz

1. A student must be enrolled in the quiz's subject and within the quiz's availability window. Room-mode quizzes additionally require the student to join an eligible active room.
2. The server creates an attempt with a server-calculated deadline and optionally shuffled question/option order. Responses return question text/options/marks but omit correct answers.
3. Answer changes are sent to the attempt answer endpoint and persisted with timestamps. Students can resume an in-progress attempt by reopening it.
4. The student may submit early. Otherwise, the server's expiry sweep finalizes the attempt after its deadline. Ending a quiz also finalizes active attempts.
5. `sameAnswer` compares strings after trimming outer whitespace and lowercasing. Correct responses earn the question's marks; incorrect and blank responses earn zero. There is no manual marking or negative-marking setting in the current quiz flow.
6. Finalization stores the attempt score and upserts a grade out of 10. A teacher publishes each grade; students see only published grades and may request clarification.

### Assessment states

The model supports states including `DRAFT`, `SCHEDULED`, `AVAILABLE`, `LIVE`, `PAUSED`, `ENDED`, `COMPLETED`, `PUBLISHED`, and `CANCELLED`. Routes and lifecycle services perform transitions. A room start sets the assessment to `LIVE`; pausing freezes remaining attempt time, resuming shifts deadlines by the paused duration, and ending finalizes active attempts. The list route also updates scheduled and expired assessments based on current time. Attempt states are `IN_PROGRESS`, `SUBMITTED`, and `EVALUATED` (the final state is available for future use; current quiz finalization stores `SUBMITTED`).

## Identity, roles, and request security

`POST /api/auth/google` verifies a Google ID token against `GOOGLE_CLIENT_ID`, requires a verified email, and checks `ALLOWED_EMAIL_DOMAINS` or `ALLOWED_EMAILS`. On first sign-in, an allowed email is automatically provisioned as an active student. Admin and teacher roles must still be assigned by an administrator. The server returns an HTTP-only `accessToken` cookie containing a signed JWT. API authentication reloads the user and rejects disabled or unapproved accounts.

Role middleware provides broad access gates (`admin`, `teacher`, `student`); route handlers then apply resource checks such as subject assignment, enrollment, quiz ownership, or room membership. Socket.IO uses the same cookie/JWT identity and authorizes room membership and teacher controls before joining a socket room or changing a quiz state.

The server uses Helmet, credentialed CORS, a 1 MB JSON body limit, general and authentication rate limits, and upload-specific size/MIME checks. Assignment files are stored on local disk under `UPLOAD_DIR` (default `server/storage`) using generated filenames. Production deployments should mount persistent, access-controlled storage or replace this mechanism with managed object storage.

## API conventions

- Base path: `/api`.
- Success: `{ "ok": true, "data": ... }`.
- Failure: `{ "ok": false, "error": ... }`; Zod failures also include issue details.
- Browser auth: HTTP-only `accessToken` cookie; CORS is configured with credentials.
- Pagination helpers are available on list endpoints that accept `page` and `limit`.
- The canonical endpoint summary is [docs/API.md](docs/API.md). Routes and validation details live in `server/src/routes/api.js`. A few secondary flows, such as extension endpoints and administrative import behavior, are documented inline in that route module.

## Local development

### Requirements

- Node.js 20 or later and npm.
- MongoDB 7 (Docker Compose can run it locally).
- A Google OAuth web client ID for interactive Google login. The API and client must use the matching ID.

### Install and configure

```bash
npm install
cp .env.example .env
```

Set the following values in `.env` for local Node development:

```dotenv
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/rvce_academic_hub
JWT_SECRET=replace-with-a-long-random-secret
JWT_TTL=4h
GOOGLE_CLIENT_ID=your-google-web-client-id
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
ALLOWED_EMAIL_DOMAINS=rvce.edu.in
ALLOWED_EMAILS=
VITE_API_URL=http://localhost:4000/api
```

`VITE_GOOGLE_CLIENT_ID` is read by Vite at build/dev-server time. Restart Vite after changing it. Never commit `.env`, real OAuth credentials, or production secrets.

Start MongoDB and the app:

```bash
docker compose up -d mongo
npm run dev
```

The root `dev` script starts the API and Vite client concurrently. Open <http://localhost:5173>; check API health at <http://localhost:4000/api/health>. For a production-style run, use `docker compose up --build` (app on <http://localhost:4000>) or see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Render.

### Users, roles and academic data

- **Administrator:** `maaryamannp.mca25@rvce.edu.in` is created by the seed as the administrator and signs in with Google.
- **Students:** anyone with a verified `@rvce.edu.in` address (or an `ALLOWED_EMAILS` entry) who signs in for the first time becomes an active student and is enrolled in every current-semester subject (subjects marked `autoEnroll`). The administrator removes electives a student did not choose from *Subjects -> Allocations*.
- **Teachers:** the administrator opens *Students*, edits the person and changes the role to *Teacher* (or *Administrator*), then allocates them to subjects.

`npm run seed -w server` (or `./run.sh seed`) loads the real MCA 2024-scheme semester III data from `server/src/data/`, transcribed from `scheme-syllabus/MCA-24-Scheme-3rd-Semester.pdf`: the MCA department, academic year 2026-27, the eight subjects with their syllabus (units, lab, outcomes, references, evaluation), a 150-question bank (five per unit), Quiz 1 and Quiz 2 drafts for each theory course, a welcome announcement per subject and tentative CIE calendar entries. It removes the old example data, never overwrites records that already exist, and is safe to re-run.

When `MONGODB_URI` does not name a database (common for Atlas URIs ending in `/`), the app uses `rvce_academic_hub`, or `MONGODB_DB` if set.

## Testing

| Command | What runs |
|---|---|
| `npm test` | Server unit and HTTP tests: scoring, CIE rules, proctoring, exports, electives, sign-in, rate limits, and a route-guard test that checks every API route needs a session |
| `npm run test:client` | Client unit tests (Vitest) |
| `./run.sh e2e` | Playwright end-to-end tests in Chromium against a throwaway local MongoDB (port 27018, database `rvce_e2e`): elective choice, a proctored quiz, publishing and Excel export, a mark review, CIE entry and publishing, and question-paper import from a photo, a text PDF and a scanned PDF |

CI (`.github/workflows/ci.yml`) runs lint, both unit suites, the production build and the end-to-end tests on every push and pull request, and uploads the Playwright report when a test fails.

## Developer commands

Run at repository root:

| Command | Action |
|---|---|
| `npm run dev` | Start API and Vite dev server concurrently. |
| `npm run build` | Build the browser client for production. |
| `npm run lint` | Run ESLint on the client and Node syntax check on the server entry point. |
| `npm test` | Run server tests via Node's built-in test runner. |

Workspace commands:

```bash
npm run dev -w server
npm run lint -w client
npm run test -w server
npm run build -w client
```

The HTTP tests bind to loopback. In restricted sandboxes, the test process may require loopback permission. There are no database-backed integration tests in the current suite. The client workspace has a Vitest script, but the current root verification path is the server Node test suite plus client lint/build.

## Deployment notes and known limits

- Set a strong `JWT_SECRET`, production OAuth client IDs, production allowed origin, approved email domain, and `TRUST_PROXY` only when the app is behind a correctly configured trusted proxy.
- Provision at least one administrator securely before institutional use. Anyone with a verified address on an allowed domain can sign in and becomes a student, so keep `ALLOWED_EMAIL_DOMAINS` and `ALLOWED_EMAILS` limited to institutional addresses.
- Question-paper OCR is English-only and works best on printed, flat, well-lit pages. Handwriting, multi-column layouts, maths notation and code are often misread, which is why every draft is reviewed before import.
- Local assignment upload storage is not a shared or automatically durable production storage layer.
- Production runs as one service: the API serves the built client from the same origin. Deploy on Render with `render.yaml`, or anywhere with the `Dockerfile` / `docker-compose.yml`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- This is an actively developed application. Review role authorization, data retention, backups, privacy requirements, accessibility, and institutional policies before using real student data.

## Making a code change

1. Find the owning layer: screen in `client/src/App.jsx`, route in `server/src/routes/api.js`, reusable domain operation in `server/src/services/`, schema/index in `server/src/models/index.js`.
2. Keep server-side validation and authorization authoritative; client form constraints improve usability but are not security checks.
3. Update the affected test and docs when behavior or payloads change.
4. Run the relevant lint/test/build commands and inspect `git diff` before committing.
