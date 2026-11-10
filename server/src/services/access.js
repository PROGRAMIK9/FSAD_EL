import { Subject } from '../models/index.js';

/** Subject ids a teacher is allocated to (admins: null meaning "all"). */
export async function teachingSubjectIds(user) {
  if (user.role === 'admin') return null;
  return Subject.find({ teachers: user._id }).distinct('_id');
}

export const teachesSubject = (subject, user) =>
  user.role === 'admin' || subject?.teachers?.some((id) => String(id._id || id) === String(user._id));
