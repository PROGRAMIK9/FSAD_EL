import { Router } from 'express';
import { z } from 'zod';
import { authenticate, allow } from '../middleware/auth.js';
import { Assessment, CieRecord, Grade, Subject, User } from '../models/index.js';
import { teachesSubject } from '../services/access.js';
import { CIE_FIELDS, computeCie } from '../services/cie.js';
import { notify } from '../services/notifications.js';
import { audit } from '../utils/audit.js';
import { EXPORT_FORMATS, sendTable } from '../utils/export.js';
import { httpError, oid, send, wrap } from '../utils/http.js';

const router = Router();

async function loadSubjectForStaff(id, user) {
  if (!oid(id)) throw httpError(400, 'Invalid id');
  const subject = await Subject.findOne({ _id: id, archivedAt: null }).lean();
  if (!subject) throw httpError(404, 'Subject not found');
  if (!teachesSubject(subject, user)) throw httpError(403, 'Not allocated to subject');
  return subject;
}

const hasLabFor = (subject) => Boolean(subject.syllabus?.cieLab?.length);

/** One row per enrolled student: quiz marks from grades plus teacher-entered components. */
async function buildSheet(subject, studentFilter = null) {
  const hasLab = hasLabFor(subject);
  const quizzes = await Assessment.find({ subject: subject._id, cieSlot: { $in: ['QUIZ1', 'QUIZ2'] } })
    .select('title state cieSlot')
    .lean();
  const slotOf = new Map(quizzes.map((q) => [String(q._id), q.cieSlot]));
  const studentIds = studentFilter ? [studentFilter] : subject.students;
  const [students, records, grades] = await Promise.all([
    User.find({ _id: { $in: studentIds }, role: 'student' })
      .select('name usn email')
      .sort({ usn: 1, name: 1 })
      .lean(),
    CieRecord.find({ subject: subject._id, student: { $in: studentIds } }).lean(),
    Grade.find({ assessment: { $in: quizzes.map((q) => q._id) }, student: { $in: studentIds } })
      .select('assessment student rawMarks publishedAt')
      .lean(),
  ]);
  const recordOf = new Map(records.map((r) => [String(r.student), r]));
  const rows = students.map((s) => {
    const rec = recordOf.get(String(s._id)) || {};
    const mine = grades.filter((g) => g.student.equals(s._id));
    const quiz = (slot) => mine.find((g) => slotOf.get(String(g.assessment)) === slot);
    const q1 = quiz('QUIZ1');
    const q2 = quiz('QUIZ2');
    const marks = {
      quiz1: q1?.rawMarks,
      quiz2: q2?.rawMarks,
      ...Object.fromEntries(Object.keys(CIE_FIELDS).map((k) => [k, rec[k]])),
    };
    return {
      student: s,
      marks,
      quizPublished: { quiz1: Boolean(q1?.publishedAt), quiz2: Boolean(q2?.publishedAt) },
      result: computeCie(marks, { hasLab }),
      updatedAt: rec.updatedAt,
    };
  });
  return { hasLab, quizzes, rows };
}

router.get(
  '/subjects/:id/cie',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const subject = await loadSubjectForStaff(req.params.id, req.user);
    const sheet = await buildSheet(subject);
    send(res, {
      subject: {
        _id: subject._id,
        code: subject.code,
        name: subject.name,
        ciePublishedAt: subject.ciePublishedAt,
      },
      ...sheet,
    });
  }),
);

const markField = (max) => z.union([z.number().min(0).max(max), z.null()]).optional();
const patchSchema = z
  .object(Object.fromEntries(Object.entries(CIE_FIELDS).map(([k, max]) => [k, markField(max)])))
  .strict();

router.patch(
  '/subjects/:id/cie/:studentId',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const subject = await loadSubjectForStaff(req.params.id, req.user);
    if (!oid(req.params.studentId) || !subject.students.some((s) => String(s) === req.params.studentId))
      throw httpError(404, 'Student is not enrolled in this subject');
    const body = patchSchema.parse(req.body);
    if (!hasLabFor(subject) && ('labRecord' in body || 'labTest' in body))
      throw httpError(400, 'This subject has no lab component');
    const set = { updatedBy: req.user._id };
    const unset = {};
    for (const [k, v] of Object.entries(body)) (v === null ? unset : set)[k] = v === null ? 1 : v;
    await CieRecord.updateOne(
      { subject: subject._id, student: req.params.studentId },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { upsert: true },
    );
    const { rows } = await buildSheet(subject, req.params.studentId);
    send(res, rows[0]);
  }),
);

router.post(
  ['/subjects/:id/cie/publish', '/subjects/:id/cie/unpublish'],
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const subject = await loadSubjectForStaff(req.params.id, req.user);
    const publishing = req.path.endsWith('/publish');
    await Subject.updateOne(
      { _id: subject._id },
      publishing ? { $set: { ciePublishedAt: new Date() } } : { $unset: { ciePublishedAt: 1 } },
    );
    await audit(req, publishing ? 'CIE_PUBLISHED' : 'CIE_UNPUBLISHED', 'Subject', subject._id);
    if (publishing)
      await notify(req.app, subject.students, {
        title: 'CIE marks published',
        body: `Your CIE marks for ${subject.code} ${subject.name} are available.`,
        href: `/subjects/${subject._id}`,
      });
    send(res, { published: publishing });
  }),
);

router.get(
  '/subjects/:id/cie.:format',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    if (!EXPORT_FORMATS.includes(req.params.format)) throw httpError(404, 'Unknown export format');
    const subject = await loadSubjectForStaff(req.params.id, req.user);
    const { hasLab, rows } = await buildSheet(subject);
    const n = (k, header, width = 9) => ({ header, key: k, width, format: 'number' });
    const columns = [
      { header: 'Student', key: 'name', width: 24 },
      { header: 'USN', key: 'usn', width: 14 },
      n('quiz1', 'Quiz 1 (10)'),
      n('quiz2', 'Quiz 2 (10)'),
      n('quizzes', 'Quizzes (20)', 11),
      n('test1', 'Test 1 (50)'),
      n('test2', 'Test 2 (50)'),
      n('tests', 'Tests (40)', 10),
      n('el1', 'EL I (20)'),
      n('el2', 'EL II (20)'),
      n('el', 'EL (40)'),
      n('total', 'CIE (100)', 10),
      ...(hasLab
        ? [
            n('labRecord', 'Lab record (40)', 14),
            n('labTest', 'Lab test (10)', 12),
            n('lab', 'CIE lab (50)', 12),
          ]
        : []),
      { header: 'Quiz + test >= 30', key: 'eligible', width: 16 },
    ];
    const data = rows.map((r) => ({
      name: r.student.name,
      usn: r.student.usn,
      ...r.marks,
      ...r.result,
      eligible: r.result.eligible === null ? 'Pending' : r.result.eligible ? 'Yes' : 'No',
    }));
    await sendTable(res, req.params.format, `${subject.code}-cie-${subject.academicYear || ''}`, [
      { name: 'CIE', columns, rows: data },
    ]);
  }),
);

router.get(
  '/me/cie/:subjectId',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    if (!oid(req.params.subjectId)) throw httpError(400, 'Invalid id');
    const subject = await Subject.findOne({
      _id: req.params.subjectId,
      students: req.user._id,
      archivedAt: null,
    }).lean();
    if (!subject) throw httpError(404, 'Subject not found');
    if (!subject.ciePublishedAt) throw httpError(404, 'CIE marks are not published yet');
    const { hasLab, rows } = await buildSheet(subject, req.user._id);
    send(res, { hasLab, publishedAt: subject.ciePublishedAt, ...rows[0] });
  }),
);

export default router;
