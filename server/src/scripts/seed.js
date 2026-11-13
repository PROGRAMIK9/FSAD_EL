/**
 * Loads the real MCA 3rd-semester scheme and syllabus (RVCE MCA 2024 scheme):
 * department, academic year, subjects with syllabus, the administrator, a
 * question bank per unit, Quiz 1 / Quiz 2 drafts, welcome announcements and
 * tentative CIE calendar entries. Removes the old example (dummy) data.
 *
 * Idempotent: existing records are never overwritten, so edits made in the app
 * (questions, quizzes, allocations) survive a re-run.
 *
 *   npm run seed -w server
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import { connectDB } from '../config/db.js';
import {
  AcademicCalendarEvent,
  AcademicYear,
  Announcement,
  Assessment,
  Attempt,
  Department,
  Enrollment,
  Grade,
  GradeReviewRequest,
  Notification,
  Question,
  Room,
  Semester,
  Subject,
  TeacherAssignment,
  User,
} from '../models/index.js';
import { ACADEMIC_YEAR, ADMIN, CIE_THEORY, COURSES, DEPARTMENT, SEMESTER } from '../data/mca-sem3.js';
import { QUESTIONS } from '../data/mca-sem3-questions.js';
import { nameFromEmail } from '../services/auth.js';
import { enrollInDefaultSubjects } from '../services/enrolment.js';
import { resetUnchosenElectives } from '../services/electives.js';

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const PROCTORING = {
  enabled: true,
  requireFullscreen: true,
  maxViolations: 3,
  blockClipboard: true,
  blockContextMenu: true,
  detectDuplicateTab: true,
  detectDevtools: false,
};

/** Deterministic shuffle so correct answers are spread over A-D but stay stable between runs. */
function stableShuffle(items, seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = items.map((v, i) => ({ v, i }));
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V'][n] || String(n);
const ist = (date, hh, mm) =>
  new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`);
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const counts = {};
const tally = (key, created) => (counts[key] = (counts[key] || 0) + (created ? 1 : 0));

/** Upserts and reports whether a new document was inserted. */
async function upsert(Model, filter, onInsert, set = {}) {
  const r = await Model.updateOne(
    filter,
    { $setOnInsert: onInsert, ...(Object.keys(set).length ? { $set: set } : {}) },
    { upsert: true },
  );
  return Boolean(r.upsertedCount);
}

async function removeExampleData() {
  const dummyUsers = await User.find({ email: /@example\.invalid$/i }).distinct('_id');
  const dummyDept = await Department.findOne({ code: 'CSE', name: 'Computer Science and Engineering' });
  const dummySubjects = dummyDept
    ? await Subject.find({ department: dummyDept._id, code: { $in: ['CS301', 'CS302', 'CS303'] } }).distinct(
        '_id',
      )
    : [];
  const dummyAssessments = await Assessment.find({
    $or: [{ subject: { $in: dummySubjects } }, { title: /sample practice$/i }],
  }).distinct('_id');
  const grades = await Grade.find({
    $or: [{ assessment: { $in: dummyAssessments } }, { student: { $in: dummyUsers } }],
  }).distinct('_id');
  const removed = {
    users: dummyUsers.length,
    subjects: dummySubjects.length,
    quizzes: dummyAssessments.length,
  };
  await GradeReviewRequest.deleteMany({ grade: { $in: grades } });
  await Grade.deleteMany({ _id: { $in: grades } });
  await Attempt.deleteMany({
    $or: [{ assessment: { $in: dummyAssessments } }, { student: { $in: dummyUsers } }],
  });
  await Room.deleteMany({ assessment: { $in: dummyAssessments } });
  await Assessment.deleteMany({ _id: { $in: dummyAssessments } });
  await Question.deleteMany({ subject: { $in: dummySubjects } });
  await Enrollment.deleteMany({
    $or: [{ subject: { $in: dummySubjects } }, { student: { $in: dummyUsers } }],
  });
  await TeacherAssignment.deleteMany({
    $or: [{ subject: { $in: dummySubjects } }, { teacher: { $in: dummyUsers } }],
  });
  await Notification.deleteMany({ recipient: { $in: dummyUsers } });
  await Subject.deleteMany({ _id: { $in: dummySubjects } });
  await Subject.updateMany({}, { $pull: { students: { $in: dummyUsers }, teachers: { $in: dummyUsers } } });
  await User.deleteMany({ _id: { $in: dummyUsers } });
  if (
    dummyDept &&
    !(await Subject.exists({ department: dummyDept._id })) &&
    !(await User.exists({ department: dummyDept._id }))
  )
    await Department.deleteOne({ _id: dummyDept._id }).then(() => (removed.departments = 1));
  return removed;
}

function welcomeText(c) {
  const lines = [
    `Welcome to ${c.name} (${c.code}), ${c.category}, ${c.ltp} (L-T-P), ${c.credits} credits.`,
    '',
  ];
  if (c.units.length) {
    lines.push('Units:');
    for (const u of c.units) lines.push(`  Unit ${roman(u.number)}: ${u.title} (${u.hours} hours)`);
    lines.push('', `CIE: ${CIE_THEORY.summary}`);
    if (c.cieLab)
      lines.push('CIE lab: conduction of experiments and lab record (40) + lab test (10) = 50 marks.');
    lines.push(
      '',
      'Quiz 1 covers Units I-II and Quiz 2 covers Units III-V. Watch the calendar for the dates.',
    );
  } else {
    lines.push(...c.guidelines.slice(0, 4).map((g) => `- ${g}`));
    lines.push('', 'The full guidelines and evaluation scheme are on the subject page.');
  }
  return lines.join('\n');
}

const db = await connectDB();
try {
  console.log(`Seeding database "${db.name}"`);
  const removed = await removeExampleData();

  const dept = await Department.findOneAndUpdate(
    { code: DEPARTMENT.code },
    { $setOnInsert: { name: DEPARTMENT.name, code: DEPARTMENT.code, isActive: true } },
    { upsert: true, new: true },
  );
  const year = await AcademicYear.findOneAndUpdate(
    { label: ACADEMIC_YEAR.label },
    {
      $setOnInsert: {
        label: ACADEMIC_YEAR.label,
        startsAt: new Date(ACADEMIC_YEAR.startsAt),
        endsAt: new Date(ACADEMIC_YEAR.endsAt),
        isActive: true,
      },
    },
    { upsert: true, new: true },
  );
  await upsert(
    Semester,
    { academicYear: year._id, number: SEMESTER.number },
    {
      name: SEMESTER.name,
      startsAt: new Date(SEMESTER.startsAt),
      endsAt: new Date(SEMESTER.endsAt),
      isActive: true,
    },
  );

  const adminEmail = ADMIN.email.toLowerCase();
  const admin = await User.findOneAndUpdate(
    { email: adminEmail },
    {
      $setOnInsert: { email: adminEmail, name: nameFromEmail(adminEmail), department: dept._id },
      $set: { role: 'admin', isActive: true, approvalStatus: 'approved' },
    },
    { upsert: true, new: true },
  );

  for (const [ci, c] of COURSES.entries()) {
    const { code, name, credits, quizzes: _q, electiveGroup, ...syllabus } = c;
    const subjectCreated = await upsert(
      Subject,
      { code, academicYear: ACADEMIC_YEAR.label },
      { teachers: [], students: [], coordinator: null },
      {
        name,
        department: dept._id,
        semester: SEMESTER.number,
        credits,
        syllabus: { ...syllabus, code, name },
        // Core subjects are automatic; students choose one elective per group.
        autoEnroll: !electiveGroup,
        electiveGroup: electiveGroup || null,
      },
    );
    tally('subjects', subjectCreated);
    const subject = await Subject.findOne({ code, academicYear: ACADEMIC_YEAR.label });

    if (c.quizzes) {
      const byUnit = {};
      for (const u of c.units) {
        byUnit[u.number] = [];
        for (const q of QUESTIONS[code]?.[u.number] || []) {
          const doc = {
            subject: subject._id,
            creator: admin._id,
            text: q.text,
            type: q.type,
            topic: `Unit ${roman(u.number)}: ${u.title}`,
            difficulty: q.difficulty,
            marks: 1,
            explanation: q.explanation,
          };
          if (q.type === 'single') {
            const order = stableShuffle(q.options, q.text);
            doc.options = order.map((o, i) => ({ key: KEYS[i], text: o.v }));
            doc.correctAnswer = KEYS[order.findIndex((o) => o.i === q.correct)];
          } else {
            doc.options = [];
            doc.correctAnswer = q.answer;
          }
          tally('questions', await upsert(Question, { subject: subject._id, text: q.text }, doc));
          byUnit[u.number].push(
            (await Question.findOne({ subject: subject._id, text: q.text }).select('_id'))._id,
          );
        }
      }
      const quizzes = [
        { title: `${code} Quiz 1: Units I-II`, slot: 'QUIZ1', units: [1, 2], pick: (list) => list },
        // Quiz 2 takes 4 + 3 + 3 questions from Units III, IV and V.
        {
          title: `${code} Quiz 2: Units III-V`,
          slot: 'QUIZ2',
          units: [3, 4, 5],
          pick: (list, u) => list.slice(0, u === 3 ? 4 : 3),
        },
      ];
      for (const qz of quizzes) {
        const questionIds = qz.units.flatMap((u) => qz.pick(byUnit[u] || [], u));
        if (questionIds.length !== 10)
          throw new Error(`${qz.title} has ${questionIds.length} questions, expected 10`);
        tally(
          'quizzes',
          await upsert(
            Assessment,
            { subject: subject._id, title: qz.title },
            {
              creator: admin._id,
              description: `CIE quiz on ${qz.units.map((u) => `Unit ${roman(u)}: ${c.units[u - 1].title}`).join('; ')}. 10 questions, 1 mark each. Review the questions, set the schedule and publish.`,
              category: 'Quiz',
              state: 'DRAFT',
              questionIds,
              maxMarks: 10,
              durationMinutes: 20,
              availabilityMode: 'scheduled',
              attemptsAllowed: 1,
              randomizeQuestions: true,
              randomizeOptions: true,
              proctoring: PROCTORING,
              cieSlot: qz.slot,
            },
          ),
        );
        // Older drafts get their CIE slot, unless a teacher already gave that slot to another quiz.
        if (!(await Assessment.exists({ subject: subject._id, cieSlot: qz.slot })))
          await Assessment.updateOne(
            { subject: subject._id, title: qz.title, cieSlot: null },
            { $set: { cieSlot: qz.slot } },
          );
      }
      // Tentative CIE calendar, staggered by a day per course.
      const plan = [
        ['Quiz 1', '2026-11-20', 'Units I-II, 10 marks, online'],
        ['Test 1', '2026-11-25', 'Descriptive test, 50 marks'],
        ['Experiential Learning Phase I', '2026-12-01', 'EL review, 20 marks'],
        ['Quiz 2', '2026-12-07', 'Units III-V, 10 marks, online'],
        ['Test 2', '2026-12-12', 'Descriptive test, 50 marks'],
        ['Experiential Learning Phase II', '2026-12-17', 'EL review, 20 marks'],
      ];
      for (const [what, date, detail] of plan) {
        const day = addDays(date, ci);
        const title = `${code} ${what} (tentative)`;
        tally(
          'calendar',
          await upsert(
            AcademicCalendarEvent,
            { subject: subject._id, title },
            {
              description: `${name}: ${detail}. Tentative date; faculty will confirm.`,
              startAt: ist(day, 10, 0),
              endAt: ist(day, what.startsWith('Quiz') ? 10 : 11, what.startsWith('Quiz') ? 30 : 30),
              type: 'CIE',
              createdBy: admin._id,
            },
          ),
        );
      }
    }

    tally(
      'announcements',
      await upsert(
        Announcement,
        { subject: subject._id, title: `Welcome to ${name}` },
        { author: admin._id, body: welcomeText(c), publishedAt: new Date() },
      ),
    );
  }

  // Students enrolled in every elective by the earlier rule are asked to choose instead.
  const electivesReset = await resetUnchosenElectives();
  // Students who signed in before the subjects existed get enrolled now.
  let enrolled = 0;
  for (const student of await User.find({ role: 'student', isActive: true }).select('_id role')) {
    await enrollInDefaultSubjects(student);
    enrolled++;
  }

  const removedText = Object.entries(removed)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  console.log(`Removed example data: ${removedText || 'none found'}`);
  console.log(`Administrator: ${admin.email}`);
  console.log(
    `Created: ${counts.subjects || 0} subjects, ${counts.questions || 0} questions, ${counts.quizzes || 0} quiz drafts, ${counts.announcements || 0} announcements, ${counts.calendar || 0} calendar events (existing records left unchanged)`,
  );
  console.log(
    `Checked ${enrolled} existing student(s): enrolled in the ${COURSES.filter((c) => !c.electiveGroup).length} core subjects; ${electivesReset} asked to choose their elective again`,
  );
} finally {
  await db.close();
}
