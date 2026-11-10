import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import { connectDB } from '../config/db.js';
import {
  Department,
  User,
  Subject,
  Enrollment,
  Question,
  Assessment,
  TeacherAssignment,
} from '../models/index.js';
const db = await connectDB();
try {
  const department = await Department.findOneAndUpdate(
    { code: 'CSE' },
    { name: 'Computer Science and Engineering', code: 'CSE', isActive: true },
    { upsert: true, new: true },
  );
  const accounts = [
    { name: 'RVCE Administrator', email: 'admin@example.invalid', role: 'admin' },
    { name: 'Faculty One', email: 'faculty1@example.invalid', role: 'teacher' },
    { name: 'Faculty Two', email: 'faculty2@example.invalid', role: 'teacher' },
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `Student ${String(i + 1).padStart(2, '0')}`,
      email: `student${i + 1}@example.invalid`,
      role: 'student',
      usn: `1RV26CS${String(i + 1).padStart(3, '0')}`,
      semester: 3,
      section: 'A',
      academicYear: '2026-27',
    })),
  ];
  const users = [];
  for (const account of accounts) {
    const user = await User.findOneAndUpdate(
      { email: account.email },
      process.env.SEED_ACTIVATE === 'true'
        ? {
            $setOnInsert: { ...account, department: department._id },
            $set: { isActive: true, approvalStatus: 'approved' },
          }
        : {
            $setOnInsert: {
              ...account,
              department: department._id,
              isActive: false,
              approvalStatus: 'pending',
            },
          },
      { upsert: true, new: true },
    );
    users.push(user);
  }
  const teachers = users.filter((u) => u.role === 'teacher'),
    students = users.filter((u) => u.role === 'student');
  const specs = [
    ['CS301', 'Data Structures and Algorithms', 4],
    ['CS302', 'Database Management Systems', 4],
    ['CS303', 'Computer Networks', 3],
  ];
  for (const [code, name, credits] of specs) {
    const subject = await Subject.findOneAndUpdate(
      { code, academicYear: '2026-27' },
      {
        name,
        code,
        department: department._id,
        semester: 3,
        academicYear: '2026-27',
        credits,
        teachers: teachers.map((u) => u._id),
        coordinator: teachers[0]._id,
        students: students.map((u) => u._id),
      },
      { upsert: true, new: true },
    );
    await Promise.all(
      students.map((student) =>
        Enrollment.findOneAndUpdate(
          { student: student._id, subject: subject._id },
          { $set: { academicYear: '2026-27', section: 'A', active: true } },
          { upsert: true },
        ),
      ),
    );
    await Promise.all(
      teachers.map((teacher, index) =>
        TeacherAssignment.findOneAndUpdate(
          { teacher: teacher._id, subject: subject._id, role: index === 0 ? 'coordinator' : 'primary' },
          { $set: { active: true, assignedAt: new Date() } },
          { upsert: true },
        ),
      ),
    );
    const q1 = await Question.findOneAndUpdate(
      { subject: subject._id, text: 'Which data structure uses first-in, first-out order?' },
      {
        $set: {
          creator: teachers[0]._id,
          type: 'single',
          topic: 'Foundations',
          difficulty: 'easy',
          marks: 5,
          negativeMarks: 0,
          options: [
            { key: 'A', text: 'Queue' },
            { key: 'B', text: 'Stack' },
            { key: 'C', text: 'Tree' },
          ],
          correctAnswer: 'A',
        },
      },
      { upsert: true, new: true },
    );
    const q2 = await Question.findOneAndUpdate(
      { subject: subject._id, text: 'Which structure supports key-value lookup?' },
      {
        $set: {
          creator: teachers[0]._id,
          type: 'single',
          topic: 'Foundations',
          difficulty: 'easy',
          marks: 5,
          negativeMarks: 0,
          options: [
            { key: 'A', text: 'Hash map' },
            { key: 'B', text: 'Queue' },
            { key: 'C', text: 'Stack' },
          ],
          correctAnswer: 'A',
        },
      },
      { upsert: true, new: true },
    );
    await Assessment.findOneAndUpdate(
      { subject: subject._id, title: `${code} sample practice` },
      {
        $set: {
          creator: teachers[0]._id,
          category: 'Quiz',
          state: 'DRAFT',
          questionIds: [q1._id, q2._id],
          maxMarks: 10,
          durationMinutes: 20,
          availabilityMode: 'scheduled',
          attemptsAllowed: 1,
        },
      },
      { upsert: true, new: true },
    );
  }
  console.log(
    `Seeded ${users.length} ${process.env.SEED_ACTIVATE === 'true' ? 'active' : 'disabled'} example identities, ${specs.length} subjects and sample question/assessment data. Provision verified identities securely before use.`,
  );
} finally {
  await db.close();
}
