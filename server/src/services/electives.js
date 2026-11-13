import { Enrollment, Subject, User } from '../models/index.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const unitTitles = (s) => (s.syllabus?.units || []).map((u) => u.title);

/** The student's current subject in a group: their recorded choice, else an allocation by the admin. */
function currentChoice(user, options) {
  const recorded =
    user.electives?.get?.(options[0].electiveGroup) || user.electives?.[options[0].electiveGroup];
  if (recorded && options.some((o) => o._id.equals(recorded))) return String(recorded);
  const allocated = options.filter((o) => o.students.some((id) => id.equals(user._id)));
  return allocated.length === 1 ? String(allocated[0]._id) : null;
}

/** Elective groups with their options, the student's choice and whether the group is locked. */
export async function electiveGroupsFor(user) {
  const subjects = await Subject.find({ electiveGroup: { $nin: [null, ''] }, archivedAt: null })
    .select('code name credits electiveGroup electiveLockedAt students syllabus.units syllabus.category')
    .sort({ code: 1 })
    .lean();
  const groups = {};
  for (const s of subjects) (groups[s.electiveGroup] ||= []).push(s);
  return Object.entries(groups).map(([group, options]) => ({
    group,
    locked: options.some((o) => o.electiveLockedAt),
    choice: currentChoice(user, options),
    options: options.map((o) => ({
      _id: String(o._id),
      code: o.code,
      name: o.name,
      credits: o.credits,
      category: o.syllabus?.category,
      units: unitTitles(o),
      students: o.students.length,
    })),
  }));
}

/** Enrols the student in one elective of its group and removes them from the others. */
export async function chooseElective(user, subjectId) {
  const subject = await Subject.findOne({ _id: subjectId, archivedAt: null }).select(
    'electiveGroup electiveLockedAt academicYear',
  );
  if (!subject?.electiveGroup) throw httpError(400, 'That subject is not an elective');
  const group = await Subject.find({ electiveGroup: subject.electiveGroup, archivedAt: null }).select(
    '_id electiveLockedAt',
  );
  if (group.some((s) => s.electiveLockedAt))
    throw httpError(409, 'Elective choices are closed. Contact the department administrator.');
  const others = group.filter((s) => !s._id.equals(subject._id)).map((s) => s._id);
  await Subject.updateMany({ _id: { $in: others } }, { $pull: { students: user._id } });
  await Subject.updateOne({ _id: subject._id }, { $addToSet: { students: user._id } });
  await Enrollment.updateMany({ student: user._id, subject: { $in: others } }, { $set: { active: false } });
  await Enrollment.updateOne(
    { student: user._id, subject: subject._id },
    { $set: { active: true, academicYear: subject.academicYear } },
    { upsert: true },
  );
  await User.updateOne({ _id: user._id }, { $set: { [`electives.${subject.electiveGroup}`]: subject._id } });
  return { group: subject.electiveGroup, subject: String(subject._id) };
}

/**
 * Students who were enrolled in several electives of one group without
 * choosing (for example by the earlier "enrol in everything" rule) are taken
 * out of that group so they are asked to choose. Returns the number of students reset.
 */
export async function resetUnchosenElectives() {
  const subjects = await Subject.find({ electiveGroup: { $nin: [null, ''] }, archivedAt: null })
    .select('_id electiveGroup students')
    .lean();
  const byGroup = {};
  for (const s of subjects) (byGroup[s.electiveGroup] ||= []).push(s);
  let reset = 0;
  for (const [group, options] of Object.entries(byGroup)) {
    const counts = new Map();
    for (const o of options)
      for (const id of o.students) counts.set(String(id), (counts.get(String(id)) || 0) + 1);
    const multi = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
    if (!multi.length) continue;
    const chosen = await User.find({
      _id: { $in: multi },
      [`electives.${group}`]: { $exists: true },
    }).distinct('_id');
    const toReset = multi.filter((id) => !chosen.some((c) => String(c) === id));
    if (!toReset.length) continue;
    const ids = options.map((o) => o._id);
    await Subject.updateMany({ _id: { $in: ids } }, { $pull: { students: { $in: toReset } } });
    await Enrollment.updateMany(
      { subject: { $in: ids }, student: { $in: toReset } },
      { $set: { active: false } },
    );
    reset += toReset.length;
  }
  return reset;
}
