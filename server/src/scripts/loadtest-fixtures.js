/**
 * Accounts and a coding lab for the load test (loadtest/code-lab.k6.js). Staging only:
 *
 *   LOADTEST=true MONGODB_URI=... node server/src/scripts/loadtest-fixtures.js [students=250]
 *
 * Creates lt.teacher@rvce.edu.in and lt.student<N>@rvce.edu.in, enrols the students in one
 * subject, adds a coding question (1 sample + 5 hidden tests) and opens a 90-minute Lab.
 * Prints the assessment id for the k6 script. Run the API with DEV_LOGIN=true and a
 * NODE_ENV other than production so k6 can sign in.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import { connectDB } from '../config/db.js';
import { Assessment, Department, Question, Subject, User } from '../models/index.js';

if (process.env.LOADTEST !== 'true') {
  console.error('Refusing to run: set LOADTEST=true and point MONGODB_URI at a staging database.');
  process.exit(1);
}
const count = Math.max(1, Number(process.argv[2]) || 250);

const db = await connectDB();
try {
  const dept = await Department.findOne({ code: 'MCA' });
  const subject = await Subject.findOne({ archivedAt: null }).sort({ code: 1 });
  if (!dept || !subject) throw new Error('Run the seed first (npm run seed -w server).');
  const base = { department: dept._id, isActive: true, approvalStatus: 'approved' };
  const teacher = await User.findOneAndUpdate(
    { email: 'lt.teacher@rvce.edu.in' },
    { $set: { ...base, name: 'Load Test Teacher', role: 'teacher' } },
    { upsert: true, new: true },
  );
  const ops = Array.from({ length: count }, (_, i) => ({
    updateOne: {
      filter: { email: `lt.student${i + 1}@rvce.edu.in` },
      update: {
        $set: {
          ...base,
          name: `Load Student ${i + 1}`,
          role: 'student',
          semester: 3,
          usn: `1RV25LT${String(i + 1).padStart(3, '0')}`,
        },
      },
      upsert: true,
    },
  }));
  await User.bulkWrite(ops);
  const students = await User.find({ email: /^lt\.student\d+@rvce\.edu\.in$/ }).distinct('_id');
  await Subject.updateOne(
    { _id: subject._id },
    { $addToSet: { teachers: teacher._id, students: { $each: students } } },
  );
  const tests = [
    ['3 4', '7', false],
    ['10 20', '30', true],
    ['-5 5', '0', true],
    ['1000000 1000000', '2000000', true],
    ['0 0', '0', true],
    ['-7 -8', '-15', true],
  ];
  const question = await Question.create({
    subject: subject._id,
    creator: teacher._id,
    type: 'code',
    text: 'Load test: read two integers and print their sum.',
    marks: 10,
    code: {
      languages: ['c', 'cpp', 'java', 'python'],
      testCases: tests.map(([input, expectedOutput, hidden]) => ({ input, expectedOutput, hidden })),
    },
  });
  const lab = await Assessment.create({
    subject: subject._id,
    creator: teacher._id,
    title: `Load test lab ${new Date().toISOString().slice(0, 16)}`,
    category: 'Lab',
    state: 'AVAILABLE',
    availabilityMode: 'instant',
    questionIds: [question._id],
    maxMarks: 10,
    durationMinutes: 90,
    proctoring: { enabled: false },
  });
  console.log(`${students.length} students enrolled in ${subject.code}.`);
  console.log(`ASSESSMENT_ID=${lab._id}`);
} finally {
  await db.close();
}
