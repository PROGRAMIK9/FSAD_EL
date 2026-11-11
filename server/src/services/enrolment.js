import { Enrollment, Subject } from '../models/index.js';

/**
 * Enrols a student in every active subject marked `autoEnroll` (the current
 * semester's subjects). Safe to call repeatedly. Returns the subject count.
 */
export async function enrollInDefaultSubjects(user) {
  if (user?.role !== 'student') return 0;
  const subjects = await Subject.find({ autoEnroll: true, archivedAt: null })
    .select('_id academicYear')
    .lean();
  if (!subjects.length) return 0;
  await Subject.updateMany(
    { _id: { $in: subjects.map((s) => s._id) } },
    { $addToSet: { students: user._id } },
  );
  await Enrollment.bulkWrite(
    subjects.map((s) => ({
      updateOne: {
        filter: { student: user._id, subject: s._id },
        update: { $set: { active: true, academicYear: s.academicYear } },
        upsert: true,
      },
    })),
  );
  return subjects.length;
}
