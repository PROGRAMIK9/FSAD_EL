/**
 * Test accounts for end-to-end tests. Run after the seed, against a throwaway
 * database only:
 *
 *   E2E=true MONGODB_URI=mongodb://127.0.0.1:27019/ node src/scripts/e2e-fixtures.js
 *
 * Creates one teacher (allocated to every subject) and two students enrolled
 * in the core subjects; neither student has chosen an elective yet.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import { connectDB } from '../config/db.js';
import { Department, Subject, TeacherAssignment, User } from '../models/index.js';
import { enrollInDefaultSubjects } from '../services/enrolment.js';

if (process.env.E2E !== 'true') {
  console.error('Refusing to run: set E2E=true and point MONGODB_URI at a throwaway database.');
  process.exit(1);
}
if (/mongodb\.net/i.test(process.env.MONGODB_URI || '')) {
  console.error('Refusing to run against a hosted (Atlas) database.');
  process.exit(1);
}

export const E2E_USERS = {
  teacher: { email: 'e2e.teacher@rvce.edu.in', name: 'Priya Teacher', role: 'teacher' },
  student1: { email: 'e2e.student1.mca25@rvce.edu.in', name: 'Asha Rao', role: 'student', usn: '1RV25MC901' },
  student2: {
    email: 'e2e.student2.mca25@rvce.edu.in',
    name: 'Ravi Kumar',
    role: 'student',
    usn: '1RV25MC902',
  },
};

const db = await connectDB();
try {
  const dept = await Department.findOne({ code: 'MCA' });
  if (!dept) throw new Error('Run the seed first (npm run seed -w server).');
  const users = {};
  for (const [key, u] of Object.entries(E2E_USERS)) {
    users[key] = await User.findOneAndUpdate(
      { email: u.email },
      {
        $set: {
          ...u,
          department: dept._id,
          isActive: true,
          approvalStatus: 'approved',
          semester: u.role === 'student' ? 3 : undefined,
        },
      },
      { upsert: true, new: true },
    );
  }
  const subjects = await Subject.find({ archivedAt: null });
  for (const s of subjects) {
    await Subject.updateOne({ _id: s._id }, { $addToSet: { teachers: users.teacher._id } });
    await TeacherAssignment.updateOne(
      { teacher: users.teacher._id, subject: s._id, role: 'primary' },
      { $set: { active: true, assignedAt: new Date() } },
      { upsert: true },
    );
  }
  for (const key of ['student1', 'student2']) await enrollInDefaultSubjects(users[key]);
  console.log(
    `E2E users ready in "${db.name}": ${Object.values(E2E_USERS)
      .map((u) => u.email)
      .join(', ')}`,
  );
} finally {
  await db.close();
}
