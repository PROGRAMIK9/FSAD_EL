import { Router } from 'express';
import { authenticate, allow } from '../middleware/auth.js';
import {
  Assessment,
  Assignment,
  AssignmentSubmission,
  Grade,
  GradeReviewRequest,
  Subject,
} from '../models/index.js';
import { send, wrap } from '../utils/http.js';

const router = Router();

const UPCOMING = ['SCHEDULED', 'AVAILABLE', 'LIVE', 'PAUSED'];

/** Role-specific dashboard numbers for teachers and students. */
router.get(
  '/dashboard/summary',
  authenticate,
  allow('teacher', 'student'),
  wrap(async (req, res) => {
    const me = req.user._id;
    if (req.user.role === 'teacher') {
      const subjectIds = await Subject.find({ teachers: me, archivedAt: null }).distinct('_id');
      const assessmentIds = await Assessment.find({ subject: { $in: subjectIds } }).distinct('_id');
      const gradeIds = await Grade.find({ assessment: { $in: assessmentIds } }).distinct('_id');
      const [upcoming, live, drafts, unpublishedGrades, openReviews, assignments] = await Promise.all([
        Assessment.countDocuments({
          subject: { $in: subjectIds },
          state: { $in: ['SCHEDULED', 'AVAILABLE'] },
        }),
        Assessment.countDocuments({ subject: { $in: subjectIds }, state: { $in: ['LIVE', 'PAUSED'] } }),
        Assessment.countDocuments({ subject: { $in: subjectIds }, state: 'DRAFT' }),
        Grade.countDocuments({ _id: { $in: gradeIds }, publishedAt: null }),
        GradeReviewRequest.countDocuments({ grade: { $in: gradeIds }, status: 'OPEN' }),
        Assignment.countDocuments({ subject: { $in: subjectIds } }),
      ]);
      return send(res, {
        subjects: subjectIds.length,
        assessments: assessmentIds.length,
        upcoming,
        live,
        drafts,
        unpublishedGrades,
        openReviews,
        assignments,
      });
    }

    const subjectIds = await Subject.find({ students: me, archivedAt: null }).distinct('_id');
    const now = new Date();
    const [upcoming, grades, openAssignments, submitted] = await Promise.all([
      Assessment.countDocuments({ subject: { $in: subjectIds }, state: { $in: UPCOMING } }),
      Grade.find({ student: me, publishedAt: { $ne: null } }).select('rawMarks maxMarks'),
      Assignment.find({ subject: { $in: subjectIds }, dueAt: { $gt: now } }).distinct('_id'),
      AssignmentSubmission.find({ student: me, status: { $ne: 'PENDING' } }).distinct('assignment'),
    ]);
    const submittedSet = new Set(submitted.map(String));
    const average = grades.length
      ? Math.round(
          (grades.reduce((n, g) => n + (g.rawMarks / (g.maxMarks || 1)) * 100, 0) / grades.length) * 10,
        ) / 10
      : null;
    send(res, {
      subjects: subjectIds.length,
      upcoming,
      publishedGrades: grades.length,
      averagePercent: average,
      pendingAssignments: openAssignments.filter((id) => !submittedSet.has(String(id))).length,
    });
  }),
);

export default router;
