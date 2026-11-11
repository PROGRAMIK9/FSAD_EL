import { randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { assignmentUpload, storedPath } from '../middleware/upload.js';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, allow } from '../middleware/auth.js';
import { authenticateGoogle, authenticateDev, devLoginEnabled } from '../services/auth.js';
import {
  User,
  Department,
  Subject,
  Enrollment,
  TeacherAssignment,
  AcademicYear,
  Semester,
  Section,
  Question,
  Assessment,
  AssessmentTemplate,
  Attempt,
  Grade,
  AuditLog,
  Assignment,
  AssignmentSubmission,
  Announcement,
  Notification,
  Room,
  GradeReviewRequest,
  AcademicCalendarEvent,
} from '../models/index.js';
import { audit } from '../utils/audit.js';
import { parseCSV } from '../utils/csv.js';
import { notify } from '../services/notifications.js';
import { transitionAssessment } from '../services/assessment-lifecycle.js';
import { wrap, send, oid, httpError } from '../utils/http.js';
import { EXPORT_FORMATS, sendTable } from '../utils/export.js';
import dashboardRoutes from './dashboard.js';
import assessmentRoutes from './assessments.js';
import questionRoutes from './questions.js';
import attemptRoutes from './attempts.js';
const router = Router();
router.use(dashboardRoutes);
router.use(assessmentRoutes);
router.use(questionRoutes);
router.use(attemptRoutes);
const getPage = (req) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(req.query.limit) || 25)),
});
router.post(
  '/auth/google',
  wrap(async (req, res) => {
    const schema = z.object({ credential: z.string().min(10) });
    const { credential } = schema.parse(req.body);
    const { user, token } = await authenticateGoogle(credential);
    setSessionCookie(res, token);
    send(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);
function setSessionCookie(res, token) {
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 4 * 60 * 60 * 1000,
  });
}
router.get(
  '/auth/dev-login',
  wrap(async (_req, res) => {
    if (!devLoginEnabled()) return send(res, { enabled: false, users: [] });
    const users = await User.find({ isActive: true, approvalStatus: 'approved' })
      .select('name email role usn')
      .sort({ role: 1, name: 1 })
      .limit(50);
    send(res, { enabled: true, users });
  }),
);
router.post(
  '/auth/dev-login',
  wrap(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const { user, token } = await authenticateDev(email);
    setSessionCookie(res, token);
    send(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);
router.post('/auth/logout', (req, res) => {
  res.clearCookie('accessToken', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  send(res, { loggedOut: true });
});
router.get('/auth/me', authenticate, (req, res) =>
  send(res, {
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      usn: req.user.usn,
      department: req.user.department,
      semester: req.user.semester,
    },
  }),
);
router.get(
  '/admin/dashboard',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const [
      students,
      teachers,
      departments,
      subjects,
      assessments,
      activeStudents,
      activeSemesters,
      upcoming,
      ongoing,
      completed,
      recentActivity,
      performance,
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'teacher' }),
      Department.countDocuments({ isActive: true }),
      Subject.countDocuments({ archivedAt: null }),
      Assessment.countDocuments(),
      User.countDocuments({ role: 'student', isActive: true }),
      Subject.distinct('semester', { archivedAt: null }),
      Assessment.countDocuments({ state: 'SCHEDULED' }),
      Assessment.countDocuments({ state: 'LIVE' }),
      Assessment.countDocuments({ state: { $in: ['COMPLETED', 'PUBLISHED'] } }),
      AuditLog.find().sort({ createdAt: -1 }).limit(8).populate('actor', 'name role'),
      Grade.aggregate([
        { $match: { publishedAt: { $ne: null } } },
        {
          $group: {
            _id: '$assessment',
            average: { $avg: { $multiply: [{ $divide: ['$rawMarks', '$maxMarks'] }, 100] } },
          },
        },
        { $lookup: { from: 'assessments', localField: '_id', foreignField: '_id', as: 'assessment' } },
        { $unwind: '$assessment' },
        { $group: { _id: '$assessment.category', average: { $avg: '$average' } } },
        { $project: { _id: 0, name: '$_id', average: { $round: ['$average', 1] } } },
      ]),
    ]);
    send(res, {
      students,
      teachers,
      departments,
      subjects,
      assessments,
      activeStudents,
      inactiveStudents: students - activeStudents,
      activeSemesters: activeSemesters.length,
      upcoming,
      ongoing,
      completed,
      recentActivity,
      performance,
    });
  }),
);
router.get(
  '/admin/users',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const { page, limit } = getPage(req);
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (oid(req.query.department)) filter.department = req.query.department;
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;
    if (req.query.status === 'pending') filter.approvalStatus = 'pending';
    if (req.query.search) {
      const re = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }, { usn: re }];
    }
    const [rows, total] = await Promise.all([
      User.find(filter)
        .select('-googleId')
        .populate('department', 'name code')
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);
    send(res, { rows, total, page, limit });
  }),
);
router.post(
  '/admin/users',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(['admin', 'teacher', 'student']),
        usn: z.string().optional(),
        department: z.string().optional(),
        semester: z.coerce.number().optional(),
        section: z.string().optional(),
      })
      .parse(req.body);
    const user = await User.create(body);
    await audit(req, 'USER_CREATED', 'User', user._id, { role: user.role });
    send(res, { user }, 201);
  }),
);
router.patch(
  '/admin/users/:id',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    if (!oid(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const body = z
      .object({
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        usn: z.string().optional(),
        department: z.string().optional(),
        semester: z.coerce.number().optional(),
        section: z.string().optional(),
        isActive: z.boolean().optional(),
        approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
      })
      .parse(req.body);
    const user = await User.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    await audit(req, 'USER_UPDATED', 'User', user._id, body);
    send(res, { user });
  }),
);
async function validateUserImport(csv) {
  const parsed = parseCSV(csv);
  if (parsed.length < 2)
    throw Object.assign(new Error('CSV must include a header and at least one record'), { status: 400 });
  const headers = parsed[0].map((x) => x.toLowerCase());
  const required = ['name', 'email', 'role', 'departmentcode'];
  const missing = required.filter((x) => !headers.includes(x));
  if (missing.length)
    throw Object.assign(new Error(`Missing columns: ${missing.join(', ')}`), { status: 400 });
  const records = [],
    errors = [],
    seenEmails = new Set(),
    seenUsns = new Set();
  for (let i = 1; i < parsed.length; i++) {
    const values = parsed[i];
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    const line = i + 1;
    const record = {
      name: row.name,
      email: row.email.toLowerCase(),
      role: row.role.toLowerCase(),
      departmentCode: row.departmentcode.toUpperCase(),
      usn: row.usn?.toUpperCase(),
      semester: row.semester ? Number(row.semester) : undefined,
      section: row.section || undefined,
    };
    const issue = [];
    if (!record.name || record.name.length < 2) issue.push('Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) issue.push('A valid email is required');
    if (!['student', 'teacher'].includes(record.role)) issue.push('Role must be student or teacher');
    if (!record.departmentCode) issue.push('Department code is required');
    if (record.role === 'student' && !record.usn) issue.push('Student USN is required');
    if (
      record.semester !== undefined &&
      (!Number.isInteger(record.semester) || record.semester < 1 || record.semester > 12)
    )
      issue.push('Semester must be an integer from 1 to 12');
    if (seenEmails.has(record.email)) issue.push('Duplicate email in CSV');
    seenEmails.add(record.email);
    if (record.usn && seenUsns.has(record.usn)) issue.push('Duplicate USN in CSV');
    if (record.usn) seenUsns.add(record.usn);
    records.push(record);
    if (issue.length) errors.push({ line, errors: issue });
  }
  const emails = records.map((r) => r.email),
    usns = records.map((r) => r.usn).filter(Boolean);
  const existing = await User.find({ $or: [{ email: { $in: emails } }, { usn: { $in: usns } }] }).select(
    'email usn',
  );
  for (const user of existing) {
    records.forEach((record, index) => {
      const issue = [];
      if (user.email === record.email) issue.push('Email already exists');
      if (user.usn && user.usn === record.usn) issue.push('USN already exists');
      if (issue.length) errors.push({ line: index + 2, errors: issue });
    });
  }
  const codes = [...new Set(records.map((r) => r.departmentCode))];
  const departments = await Department.find({ code: { $in: codes } }).select('_id code');
  const byCode = new Map(departments.map((d) => [d.code, d._id]));
  records.forEach((record, index) => {
    if (!byCode.has(record.departmentCode))
      errors.push({ line: index + 2, errors: [`Unknown department code: ${record.departmentCode}`] });
    else record.department = byCode.get(record.departmentCode);
    delete record.departmentCode;
  });
  return { records, errors };
}
router.post(
  '/admin/users/import/preview',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const { csv } = z.object({ csv: z.string().min(1).max(950_000) }).parse(req.body);
    const report = await validateUserImport(csv);
    send(res, {
      valid: report.records.length - report.errors.length,
      invalid: report.errors.length,
      total: report.records.length,
      errors: report.errors,
      preview: report.records.map(({ department, ...r }) => r),
    });
  }),
);
router.post(
  '/admin/users/import',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const { csv } = z.object({ csv: z.string().min(1).max(950_000) }).parse(req.body);
    const report = await validateUserImport(csv);
    if (report.errors.length)
      return res.status(400).json({
        ok: false,
        error: 'Import contains invalid records; correct them and preview again',
        data: { errors: report.errors, total: report.records.length },
      });
    const users = await User.insertMany(report.records, { ordered: true });
    await audit(req, 'USERS_IMPORTED', 'User', undefined, { count: users.length });
    send(
      res,
      {
        imported: users.length,
        users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
      },
      201,
    );
  }),
);
router.get(
  '/admin/departments',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => send(res, await Department.find().sort({ name: 1 }))),
);
router.post(
  '/admin/departments',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const b = z.object({ name: z.string().min(2), code: z.string().min(2) }).parse(req.body);
    const d = await Department.create(b);
    await audit(req, 'DEPARTMENT_CREATED', 'Department', d._id);
    send(res, d, 201);
  }),
);
router.get(
  '/admin/academic-years',
  authenticate,
  allow('admin'),
  wrap(async (_req, res) => send(res, await AcademicYear.find().sort({ label: -1 }))),
);
router.post(
  '/admin/academic-years',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const b = z
      .object({
        label: z.string().min(4),
        startsAt: z.coerce.date().optional(),
        endsAt: z.coerce.date().optional(),
        isActive: z.boolean().default(false),
      })
      .parse(req.body);
    if (b.startsAt && b.endsAt && b.endsAt <= b.startsAt)
      return res.status(400).json({ ok: false, error: 'End date must be after start date' });
    if (b.isActive) await AcademicYear.updateMany({ isActive: true }, { $set: { isActive: false } });
    const year = await AcademicYear.create(b);
    await audit(req, 'ACADEMIC_YEAR_CREATED', 'AcademicYear', year._id);
    send(res, year, 201);
  }),
);
router.post(
  '/admin/semesters',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const b = z
      .object({
        academicYear: z.string().refine(oid),
        number: z.coerce.number().int().min(1).max(12),
        name: z.string().optional(),
        startsAt: z.coerce.date().optional(),
        endsAt: z.coerce.date().optional(),
        isActive: z.boolean().default(false),
      })
      .parse(req.body);
    if (!(await AcademicYear.exists({ _id: b.academicYear })))
      return res.status(404).json({ ok: false, error: 'Academic year not found' });
    const semester = await Semester.create(b);
    await audit(req, 'SEMESTER_CREATED', 'Semester', semester._id);
    send(res, semester, 201);
  }),
);
router.get(
  '/admin/semesters',
  authenticate,
  allow('admin'),
  wrap(async (req, res) =>
    send(
      res,
      await Semester.find(req.query.academicYear ? { academicYear: req.query.academicYear } : {})
        .populate('academicYear', 'label')
        .sort({ number: 1 }),
    ),
  ),
);
router.post(
  '/admin/sections',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const b = z
      .object({
        department: z.string().refine(oid),
        academicYear: z.string().refine(oid),
        semester: z.string().refine(oid),
        name: z.string().min(1),
      })
      .parse(req.body);
    if (
      !(await Department.exists({ _id: b.department })) ||
      !(await AcademicYear.exists({ _id: b.academicYear })) ||
      !(await Semester.exists({ _id: b.semester, academicYear: b.academicYear }))
    )
      return res
        .status(400)
        .json({ ok: false, error: 'Section references must match a valid academic structure' });
    const section = await Section.create(b);
    await audit(req, 'SECTION_CREATED', 'Section', section._id);
    send(res, section, 201);
  }),
);
router.get(
  '/admin/sections',
  authenticate,
  allow('admin'),
  wrap(async (_req, res) =>
    send(
      res,
      await Section.find()
        .populate('department', 'name code')
        .populate('academicYear', 'label')
        .populate('semester', 'number name')
        .sort({ name: 1 }),
    ),
  ),
);
router.get(
  '/admin/audit-logs',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const { page, limit } = getPage(req);
    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.actor && oid(req.query.actor)) filter.actor = req.query.actor;
    const [rows, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'name email role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);
    send(res, { rows, total, page, limit });
  }),
);
router.get(
  '/subjects',
  authenticate,
  wrap(async (req, res) => {
    let filter = { archivedAt: null };
    if (req.user.role === 'teacher') filter.teachers = req.user._id;
    if (req.user.role === 'student') filter.students = req.user._id;
    send(
      res,
      await Subject.find(filter)
        .populate('department', 'name code')
        .populate('teachers', 'name email')
        .sort({ name: 1 }),
    );
  }),
);
router.post(
  '/admin/subjects',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const b = z
      .object({
        name: z.string().min(2),
        code: z.string().min(2),
        department: z.string().refine(oid),
        semester: z.coerce.number().min(1).max(12),
        academicYear: z.string(),
        credits: z.coerce.number().min(0).default(0),
      })
      .parse(req.body);
    const s = await Subject.create(b);
    await audit(req, 'SUBJECT_CREATED', 'Subject', s._id);
    send(res, s, 201);
  }),
);
router.patch(
  '/admin/subjects/:id/allocations',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const b = z
      .object({
        teachers: z.array(z.string().refine(oid)).optional(),
        students: z.array(z.string().refine(oid)).optional(),
        coordinator: z.string().refine(oid).optional(),
      })
      .parse(req.body);
    if (
      b.teachers?.length &&
      (await User.countDocuments({ _id: { $in: b.teachers }, role: 'teacher' })) !== new Set(b.teachers).size
    )
      throw Object.assign(new Error('All allocated teachers must be teacher accounts'), { status: 400 });
    if (
      b.students?.length &&
      (await User.countDocuments({ _id: { $in: b.students }, role: 'student' })) !== new Set(b.students).size
    )
      throw Object.assign(new Error('All enrolled users must be student accounts'), { status: 400 });
    const s = await Subject.findByIdAndUpdate(req.params.id, b, { new: true }).populate(
      'teachers students',
      'name email usn',
    );
    if (!s) return res.status(404).json({ ok: false, error: 'Subject not found' });
    if (b.students) {
      await Enrollment.updateMany(
        { subject: s._id, student: { $nin: b.students } },
        { $set: { active: false } },
      );
      for (const student of b.students)
        await Enrollment.updateOne(
          { subject: s._id, student },
          { $set: { active: true, academicYear: s.academicYear } },
          { upsert: true },
        );
    }
    if (b.teachers) {
      await TeacherAssignment.updateMany(
        { subject: s._id, teacher: { $nin: b.teachers }, active: true },
        { $set: { active: false, endedAt: new Date() } },
      );
      for (const teacher of b.teachers)
        await TeacherAssignment.updateOne(
          { subject: s._id, teacher, role: 'primary' },
          { $set: { active: true, assignedAt: new Date(), endedAt: null } },
          { upsert: true },
        );
    }
    await audit(req, 'SUBJECT_ALLOCATED', 'Subject', s._id, {
      teacherCount: s.teachers.length,
      studentCount: s.students.length,
    });
    send(res, s);
  }),
);
router.get(
  '/subjects/:id/students',
  authenticate,
  wrap(async (req, res) => {
    const s = await Subject.findById(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Subject not found' });
    if (req.user.role === 'student' && !s.students.some((x) => x.equals(req.user._id)))
      return res.status(403).json({ ok: false, error: 'Not enrolled' });
    if (req.user.role === 'teacher' && !s.teachers.some((x) => x.equals(req.user._id)))
      return res.status(403).json({ ok: false, error: 'Not allocated' });
    send(
      res,
      await User.find({ _id: { $in: s.students }, role: 'student' })
        .select('name email usn department semester section isActive lastLoginAt')
        .populate('department', 'name code')
        .sort({ name: 1 }),
    );
  }),
);
async function getAuthorizedAssessment(id, user) {
  const assessment = await Assessment.findById(id).populate('subject');
  if (!assessment) return null;
  if (user.role === 'teacher' && !assessment.subject.teachers.some((x) => x.equals(user._id)))
    throw Object.assign(new Error('Not allocated to subject'), { status: 403 });
  return assessment;
}
for (const [action, allowedStates, nextState] of [
  ['pause', ['LIVE'], 'PAUSED'],
  ['resume', ['PAUSED'], 'LIVE'],
  ['end', ['LIVE', 'PAUSED', 'AVAILABLE'], 'ENDED'],
])
  router.post(
    `/assessments/:id/${action}`,
    authenticate,
    allow('teacher', 'admin'),
    wrap(async (req, res) => {
      const a = await getAuthorizedAssessment(req.params.id, req.user);
      if (!a) return res.status(404).json({ ok: false, error: 'Assessment not found' });
      if (!allowedStates.includes(a.state))
        return res.status(409).json({ ok: false, error: `Cannot ${action} assessment in ${a.state} state` });
      await transitionAssessment(a, nextState, req.app.get('io'));
      await audit(req, `ASSESSMENT_${action.toUpperCase()}`, 'Assessment', a._id);
      send(res, a);
    }),
  );
router.patch(
  '/grade-reviews/:id',
  authenticate,
  allow('teacher'),
  wrap(async (req, res) => {
    const b = z
      .object({
        status: z.enum(['APPROVED', 'REJECTED']),
        response: z.string().min(3),
        correctedMarks: z.coerce.number().min(0).optional(),
      })
      .parse(req.body);
    const review = await GradeReviewRequest.findById(req.params.id).populate({
      path: 'grade',
      populate: { path: 'assessment', populate: { path: 'subject' } },
    });
    if (!review) return res.status(404).json({ ok: false, error: 'Review request not found' });
    if (!review.grade.assessment.subject.teachers.some((x) => x.equals(req.user._id)))
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    review.status = b.status;
    review.response = b.response;
    review.resolvedBy = req.user._id;
    await review.save();
    if (b.status === 'APPROVED' && b.correctedMarks !== undefined) {
      if (b.correctedMarks > review.grade.maxMarks)
        return res.status(400).json({ ok: false, error: 'Marks exceed maximum' });
      review.grade.rawMarks = b.correctedMarks;
      review.grade.modifiedBy = req.user._id;
      review.grade.modificationReason = b.response;
      await review.grade.save();
      await audit(req, 'GRADE_MODIFIED', 'Grade', review.grade._id, {
        reason: b.response,
        correctedMarks: b.correctedMarks,
      });
    }
    await audit(req, 'GRADE_REVIEW_RESOLVED', 'GradeReviewRequest', review._id, { status: b.status });
    send(res, review);
  }),
);
router.get(
  '/grades/student',
  authenticate,
  allow('student'),
  wrap(async (req, res) =>
    send(
      res,
      await Grade.find({ student: req.user._id, publishedAt: { $ne: null } })
        .populate({ path: 'assessment', populate: { path: 'subject', select: 'name code' } })
        .sort({ publishedAt: -1 }),
    ),
  ),
);
router.get(
  '/grades/assessment/:id',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const a = await Assessment.findById(req.params.id).populate('subject');
    if (!a) return res.status(404).json({ ok: false, error: 'Assessment not found' });
    if (req.user.role === 'teacher' && !a.subject.teachers.some((x) => x.equals(req.user._id)))
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    send(
      res,
      await Grade.find({ assessment: a._id }).populate('student', 'name usn email').sort({ createdAt: 1 }),
    );
  }),
);
router.post(
  '/grades/:id/publish',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const g = await Grade.findById(req.params.id).populate({
      path: 'assessment',
      populate: { path: 'subject' },
    });
    if (!g) return res.status(404).json({ ok: false, error: 'Grade not found' });
    if (req.user.role === 'teacher' && !g.assessment.subject.teachers.some((x) => x.equals(req.user._id)))
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    g.publishedAt = new Date();
    await g.save();
    if ((await Grade.countDocuments({ assessment: g.assessment._id, publishedAt: null })) === 0)
      await Assessment.updateOne({ _id: g.assessment._id }, { $set: { state: 'PUBLISHED' } });
    await audit(req, 'GRADE_PUBLISHED', 'Grade', g._id);
    await notify(req.app, [g.student], {
      title: 'Grade published',
      body: `Your result for ${g.assessment.title} is available.`,
      href: `/results/${g.assessment._id}`,
    });
    send(res, g);
  }),
);
router.post(
  '/rooms',
  authenticate,
  allow('teacher'),
  wrap(async (req, res) => {
    const b = z.object({ assessment: z.string().refine(oid) }).parse(req.body);
    const a = await Assessment.findById(b.assessment).populate('subject');
    if (!a || !a.subject.teachers.some((x) => x.equals(req.user._id)))
      return res.status(403).json({ ok: false, error: 'Assessment or subject unavailable' });
    if (a.availabilityMode !== 'room' || !['SCHEDULED', 'AVAILABLE'].includes(a.state))
      return res
        .status(409)
        .json({ ok: false, error: 'Room codes require a published room-mode assessment' });
    const code = `RVCE-QUIZ-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
    const room = await Room.create({
      code,
      assessment: a._id,
      teacher: req.user._id,
      eligibleStudents: a.subject.students,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    });
    await audit(req, 'ROOM_CREATED', 'Room', room._id);
    send(res, room, 201);
  }),
);
router.get(
  '/rooms/:id',
  authenticate,
  wrap(async (req, res) => {
    const room = await Room.findById(req.params.id)
      .populate('assessment', 'title state durationMinutes')
      .populate('participants', 'name usn role')
      .populate('teacher', 'name');
    if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
    const member =
      req.user.role === 'teacher'
        ? room.teacher._id.equals(req.user._id)
        : room.participants.some((x) => x.equals(req.user._id));
    if (!member) return res.status(403).json({ ok: false, error: 'Not authorized' });
    send(res, room);
  }),
);
router.post(
  '/rooms/join',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    const { code } = z.object({ code: z.string().min(8) }).parse(req.body);
    const room = await Room.findOne({
      code,
      status: { $in: ['WAITING', 'LIVE'] },
      expiresAt: { $gt: new Date() },
    });
    if (!room) return res.status(404).json({ ok: false, error: 'Room not found or expired' });
    if (!room.eligibleStudents.some((x) => x.equals(req.user._id)))
      return res.status(403).json({ ok: false, error: 'Not eligible for room' });
    if (!room.participants.some((x) => x.equals(req.user._id))) room.participants.push(req.user._id);
    await room.save();
    send(res, room);
  }),
);
router.get(
  '/notifications',
  authenticate,
  wrap(async (req, res) =>
    send(res, await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(100)),
  ),
);
router.patch(
  '/notifications/read-all',
  authenticate,
  wrap(async (req, res) => {
    const result = await Notification.updateMany(
      { recipient: req.user._id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    send(res, { modified: result.modifiedCount });
  }),
);
router.patch(
  '/notifications/:id/read',
  authenticate,
  wrap(async (req, res) => {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { readAt: new Date() },
      { new: true },
    );
    if (!n) return res.status(404).json({ ok: false, error: 'Notification not found' });
    send(res, n);
  }),
);
router.get(
  '/announcements',
  authenticate,
  wrap(async (req, res) => {
    const s = await Subject.find({
      [req.user.role === 'student' ? 'students' : 'teachers']: req.user._id,
    }).distinct('_id');
    send(
      res,
      await Announcement.find({ subject: { $in: s } })
        .sort({ publishedAt: -1 })
        .limit(100),
    );
  }),
);
router.post(
  '/announcements',
  authenticate,
  allow('teacher'),
  wrap(async (req, res) => {
    const b = z
      .object({ subject: z.string().refine(oid), title: z.string().min(3), body: z.string().min(3) })
      .parse(req.body);
    const s = await Subject.findOne({ _id: b.subject, teachers: req.user._id });
    if (!s) return res.status(403).json({ ok: false, error: 'Not allocated' });
    const a = await Announcement.create({ ...b, author: req.user._id, publishedAt: new Date() });
    await AcademicCalendarEvent.create({
      title: a.title,
      description: a.body,
      subject: s._id,
      startAt: a.publishedAt,
      endAt: a.publishedAt,
      type: 'Announcement',
      createdBy: req.user._id,
    });
    await audit(req, 'ANNOUNCEMENT_PUBLISHED', 'Announcement', a._id);
    await notify(req.app, s.students, { title: a.title, body: a.body, href: '/announcements' });
    send(res, a, 201);
  }),
);
router.get(
  '/calendar/events',
  authenticate,
  wrap(async (req, res) => {
    const filter = {};
    if (req.user.role === 'student')
      filter.$or = [
        { subject: { $in: await Subject.find({ students: req.user._id }).distinct('_id') } },
        { subject: null },
      ];
    if (req.user.role === 'teacher')
      filter.$or = [
        { subject: { $in: await Subject.find({ teachers: req.user._id }).distinct('_id') } },
        { subject: null },
      ];
    if (req.query.from || req.query.to)
      filter.startAt = {
        ...(req.query.from ? { $gte: new Date(req.query.from) } : {}),
        ...(req.query.to ? { $lte: new Date(req.query.to) } : {}),
      };
    send(
      res,
      await AcademicCalendarEvent.find(filter)
        .populate('subject', 'name code')
        .sort({ startAt: 1 })
        .limit(500),
    );
  }),
);
router.post(
  '/calendar/events',
  authenticate,
  allow('admin', 'teacher'),
  wrap(async (req, res) => {
    const b = z
      .object({
        title: z.string().min(2),
        description: z.string().optional(),
        subject: z.string().refine(oid).optional(),
        startAt: z.coerce.date(),
        endAt: z.coerce.date().optional(),
        type: z.string().default('Academic date'),
      })
      .parse(req.body);
    if (b.endAt && b.endAt < b.startAt)
      return res.status(400).json({ ok: false, error: 'End time must follow start time' });
    if (b.subject) {
      const subject = await Subject.findById(b.subject);
      if (!subject) return res.status(404).json({ ok: false, error: 'Subject not found' });
      if (req.user.role === 'teacher' && !subject.teachers.some((x) => x.equals(req.user._id)))
        return res.status(403).json({ ok: false, error: 'Not allocated to subject' });
    }
    const event = await AcademicCalendarEvent.create({ ...b, createdBy: req.user._id });
    await audit(req, 'CALENDAR_EVENT_CREATED', 'AcademicCalendarEvent', event._id);
    send(res, event, 201);
  }),
);
router.get(
  '/assessment-templates',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) =>
    send(res, await AssessmentTemplate.find({ owner: req.user._id }).sort({ createdAt: -1 })),
  ),
);
router.post(
  '/assessment-templates',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const b = z.object({ title: z.string().min(2), config: z.record(z.unknown()) }).parse(req.body);
    send(res, await AssessmentTemplate.create({ ...b, owner: req.user._id }), 201);
  }),
);
router.delete(
  '/assessment-templates/:id',
  authenticate,
  allow('teacher', 'admin'),
  wrap(async (req, res) => {
    const row = await AssessmentTemplate.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!row) return res.status(404).json({ ok: false, error: 'Template not found' });
    send(res, { deleted: true });
  }),
);
router.get(
  '/assignments',
  authenticate,
  wrap(async (req, res) => {
    const subjects = await Subject.find({
      [req.user.role === 'student' ? 'students' : 'teachers']: req.user._id,
    }).distinct('_id');
    send(
      res,
      await Assignment.find({ subject: { $in: subjects } })
        .populate('subject', 'name code')
        .sort({ dueAt: 1 }),
    );
  }),
);
router.post(
  '/assignments',
  authenticate,
  allow('teacher'),
  wrap(async (req, res) => {
    const b = z
      .object({
        subject: z.string().refine(oid),
        title: z.string().min(3),
        description: z.string().optional(),
        dueAt: z.coerce.date(),
        maxMarks: z.coerce.number().positive(),
        allowedMimeTypes: z.array(z.string()).default([]),
        maxFileBytes: z.coerce.number().max(20_000_000).default(10_000_000),
        allowResubmission: z.boolean().default(false),
      })
      .parse(req.body);
    const subject = await Subject.findOne({ _id: b.subject, teachers: req.user._id });
    if (!subject) return res.status(403).json({ ok: false, error: 'Not allocated' });
    const assignment = await Assignment.create({ ...b, creator: req.user._id });
    await AcademicCalendarEvent.create({
      title: assignment.title,
      description: assignment.description,
      subject: assignment.subject,
      startAt: assignment.dueAt,
      endAt: assignment.dueAt,
      type: 'Assignment deadline',
      createdBy: req.user._id,
    });
    await notify(req.app, subject.students, {
      title: 'New assignment',
      body: `${assignment.title} is due ${assignment.dueAt.toLocaleString()}.`,
      href: '/assignments',
    });
    send(res, assignment, 201);
  }),
);
async function checkAssignmentUpload(req, res, next) {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ ok: false, error: 'Assignment not found' });
    const subject = await Subject.findOne({ _id: assignment.subject, students: req.user._id });
    if (!subject) return res.status(403).json({ ok: false, error: 'Not enrolled in this subject' });
    req.assignment = assignment;
    const existing = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: req.user._id,
    });
    if (existing && !assignment.allowResubmission)
      return res.status(409).json({ ok: false, error: 'Resubmission is disabled' });
    req.previousSubmission = existing;
    next();
  } catch (err) {
    next(err);
  }
}
router.post(
  '/assignments/:id/submit',
  authenticate,
  allow('student'),
  checkAssignmentUpload,
  assignmentUpload,
  wrap(async (req, res) => {
    const assignment = req.assignment;
    if (!req.file) return res.status(400).json({ ok: false, error: 'Upload one file' });
    const existing = req.previousSubmission;
    const late = assignment.dueAt && Date.now() > assignment.dueAt.getTime();
    if (existing?.storagePath) await unlink(storedPath(basename(existing.storagePath))).catch(() => {});
    const submission = await AssignmentSubmission.findOneAndUpdate(
      { assignment: assignment._id, student: req.user._id },
      {
        $set: {
          fileName: req.file.originalname,
          storagePath: req.file.filename,
          submittedAt: new Date(),
          status: late ? 'LATE' : 'SUBMITTED',
        },
      },
      { upsert: true, new: true },
    );
    await audit(req, 'ASSIGNMENT_SUBMITTED', 'AssignmentSubmission', submission._id);
    send(
      res,
      {
        id: submission.id,
        fileName: submission.fileName,
        submittedAt: submission.submittedAt,
        status: submission.status,
      },
      201,
    );
  }),
);
router.get(
  '/assignments/submissions/:submissionId/download',
  authenticate,
  wrap(async (req, res) => {
    const submission = await AssignmentSubmission.findById(req.params.submissionId);
    if (!submission) return res.status(404).json({ ok: false, error: 'Submission not found' });
    const assignment = await Assignment.findById(submission.assignment);
    if (!assignment) return res.status(404).json({ ok: false, error: 'Assignment not found' });
    if (req.user.role === 'student' && !submission.student.equals(req.user._id))
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    if (req.user.role === 'teacher' && !assignment.creator.equals(req.user._id))
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    res.download(storedPath(basename(submission.storagePath)), submission.fileName);
  }),
);
router.get(
  '/assignments/:id/submissions',
  authenticate,
  allow('teacher'),
  wrap(async (req, res) => {
    const a = await Assignment.findOne({ _id: req.params.id, creator: req.user._id });
    if (!a) return res.status(404).json({ ok: false, error: 'Assignment not found' });
    send(
      res,
      await AssignmentSubmission.find({ assignment: a._id })
        .populate('student', 'name usn email')
        .sort({ submittedAt: -1 }),
    );
  }),
);
router.patch(
  '/assignments/:id/submissions/:submissionId/evaluate',
  authenticate,
  allow('teacher'),
  wrap(async (req, res) => {
    const b = z.object({ marks: z.coerce.number().min(0), feedback: z.string().optional() }).parse(req.body);
    const assignment = await Assignment.findOne({ _id: req.params.id, creator: req.user._id });
    if (!assignment) return res.status(404).json({ ok: false, error: 'Assignment not found' });
    if (b.marks > assignment.maxMarks)
      return res.status(400).json({ ok: false, error: 'Marks exceed maximum' });
    const submission = await AssignmentSubmission.findOne({
      _id: req.params.submissionId,
      assignment: assignment._id,
    });
    if (!submission) return res.status(404).json({ ok: false, error: 'Submission not found' });
    submission.marks = b.marks;
    submission.feedback = b.feedback;
    submission.status = 'EVALUATED';
    await submission.save();
    await audit(req, 'ASSIGNMENT_EVALUATED', 'AssignmentSubmission', submission._id, { marks: b.marks });
    send(res, submission);
  }),
);
router.post(
  '/grades/:id/review',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    const b = z.object({ message: z.string().min(5) }).parse(req.body);
    const grade = await Grade.findOne({
      _id: req.params.id,
      student: req.user._id,
      publishedAt: { $ne: null },
    });
    if (!grade) return res.status(404).json({ ok: false, error: 'Published grade not found' });
    send(
      res,
      await GradeReviewRequest.create({ grade: grade._id, student: req.user._id, message: b.message }),
      201,
    );
  }),
);
const GRADE_COLUMNS = [
  { header: 'Assessment', key: 'title', width: 32 },
  { header: 'Subject', key: 'subject', width: 10 },
  { header: 'Marks', key: 'marks', width: 8, format: 'number' },
  { header: 'Maximum', key: 'max', width: 10, format: 'number' },
  { header: 'Percentage', key: 'percent', width: 11, format: 'percent' },
  { header: 'Published', key: 'publishedAt', width: 18, format: 'datetime' },
];
const gradeRow = (g) => ({
  title: g.assessment?.title,
  subject: g.assessment?.subject?.code,
  marks: g.rawMarks,
  max: g.maxMarks,
  percent: g.maxMarks ? g.rawMarks / g.maxMarks : null,
  publishedAt: g.publishedAt,
  feedback: g.feedback,
});

router.get(
  '/grades/student/export.:format',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    if (!EXPORT_FORMATS.includes(req.params.format)) throw httpError(404, 'Unknown export format');
    const grades = await Grade.find({ student: req.user._id, publishedAt: { $ne: null } })
      .populate({
        path: 'assessment',
        select: 'title subject',
        populate: { path: 'subject', select: 'code' },
      })
      .sort({ publishedAt: -1 })
      .lean();
    await sendTable(res, req.params.format, `${req.user.usn || 'my'}-grades`, [
      {
        name: 'My grades',
        columns: [...GRADE_COLUMNS, { header: 'Feedback', key: 'feedback', width: 40 }],
        rows: grades.map(gradeRow),
      },
    ]);
  }),
);

router.get(
  '/admin/reports/grades.:format',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    if (!EXPORT_FORMATS.includes(req.params.format)) throw httpError(404, 'Unknown export format');
    const grades = await Grade.find({ publishedAt: { $ne: null } })
      .populate('student', 'name usn email')
      .populate({
        path: 'assessment',
        select: 'title subject',
        populate: { path: 'subject', select: 'code' },
      })
      .sort({ publishedAt: -1 })
      .lean();
    await sendTable(res, req.params.format, 'rvce-grades', [
      {
        name: 'Published grades',
        columns: [
          { header: 'Student', key: 'name', width: 24 },
          { header: 'USN', key: 'usn', width: 14 },
          { header: 'Email', key: 'email', width: 28 },
          ...GRADE_COLUMNS,
        ],
        rows: grades.map((g) => ({
          ...gradeRow(g),
          name: g.student?.name,
          usn: g.student?.usn,
          email: g.student?.email,
        })),
      },
    ]);
  }),
);
export default router;
