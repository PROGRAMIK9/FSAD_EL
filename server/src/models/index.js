import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const opts = { timestamps: true, versionKey: false };
const userSchema = new Schema(
  {
    googleId: { type: String, sparse: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, unique: true },
    role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
    usn: { type: String, uppercase: true, sparse: true, unique: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department' },
    semester: Number,
    section: String,
    academicYear: String,
    isActive: { type: Boolean, default: true },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
    lastLoginAt: Date,
  },
  opts,
);
const departmentSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, uppercase: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  opts,
);
const subjectSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, uppercase: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    semester: { type: Number, required: true },
    academicYear: { type: String, required: true },
    credits: { type: Number, default: 0 },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User' },
    teachers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    students: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    archivedAt: Date,
  },
  opts,
);
subjectSchema.index({ code: 1, academicYear: 1 }, { unique: true });
const questionSchema = new Schema(
  {
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    type: { type: String, enum: ['single', 'fill_blank'], required: true },
    topic: String,
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    marks: { type: Number, min: 0, required: true },
    options: [{ text: String, key: String }],
    correctAnswer: Schema.Types.Mixed,
    explanation: String,
    archivedAt: Date,
  },
  opts,
);
const assessmentSchema = new Schema(
  {
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: String,
    category: { type: String, enum: ['Quiz'], default: 'Quiz' },
    state: {
      type: String,
      enum: [
        'DRAFT',
        'SCHEDULED',
        'AVAILABLE',
        'LIVE',
        'PAUSED',
        'ENDED',
        'COMPLETED',
        'PUBLISHED',
        'CANCELLED',
      ],
      default: 'DRAFT',
    },
    questionIds: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
    maxMarks: { type: Number, enum: [10], required: true },
    durationMinutes: { type: Number, required: true },
    startsAt: Date,
    endsAt: Date,
    availabilityMode: { type: String, enum: ['scheduled', 'instant', 'room'], default: 'scheduled' },
    attemptsAllowed: { type: Number, default: 1 },
    randomizeQuestions: Boolean,
    randomizeOptions: Boolean,
    negativeMarking: Boolean,
    publishResultsAt: Date,
    pausedAt: Date,
    allowLateJoin: Boolean,
    proctoring: {
      enabled: { type: Boolean, default: true },
      requireFullscreen: { type: Boolean, default: true },
      // Counted violations allowed before the attempt is auto-submitted; 0 disables auto-submit.
      maxViolations: { type: Number, default: 3, min: 0, max: 20 },
      blockClipboard: { type: Boolean, default: true },
      blockContextMenu: { type: Boolean, default: true },
      detectDuplicateTab: { type: Boolean, default: true },
      detectDevtools: { type: Boolean, default: false },
    },
  },
  opts,
);
const attemptSchema = new Schema(
  {
    assessment: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questionOrder: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
    optionOrders: [{ question: Schema.Types.ObjectId, keys: [String] }],
    answers: [
      { question: Schema.Types.ObjectId, value: Schema.Types.Mixed, savedAt: Date, flagged: Boolean },
    ],
    state: { type: String, enum: ['IN_PROGRESS', 'SUBMITTED', 'EVALUATED'], default: 'IN_PROGRESS' },
    startedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    submittedAt: Date,
    score: Number,
    objectiveScore: Number,
    proctoringEvents: [{ type: { type: String }, occurredAt: Date, details: String, severity: String }],
  },
  opts,
);
attemptSchema.add({
  attemptNumber: { type: Number, default: 1 },
  violationCount: { type: Number, default: 0 },
  submitReason: {
    type: String,
    enum: ['MANUAL', 'TIMEOUT', 'ASSESSMENT_ENDED', 'PROCTORING_LIMIT', 'TEACHER'],
  },
  lastSeenAt: Date,
});
attemptSchema.index({ assessment: 1, student: 1, attemptNumber: 1 }, { unique: true });
const gradeSchema = new Schema(
  {
    assessment: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attempt: { type: Schema.Types.ObjectId, ref: 'Attempt' },
    rawMarks: Number,
    maxMarks: Number,
    feedback: String,
    publishedAt: Date,
    modifiedBy: Schema.Types.ObjectId,
    modificationReason: String,
  },
  opts,
);
gradeSchema.index({ assessment: 1, student: 1 }, { unique: true });
const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entityType: String,
    entityId: Schema.Types.ObjectId,
    details: Schema.Types.Mixed,
    ip: String,
  },
  opts,
);
const announcementSchema = new Schema(
  {
    subject: Schema.Types.ObjectId,
    author: Schema.Types.ObjectId,
    title: String,
    body: String,
    publishedAt: Date,
  },
  opts,
);
const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, required: true },
    title: String,
    body: String,
    href: String,
    readAt: Date,
  },
  opts,
);
const enrollmentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    academicYear: String,
    section: String,
    active: { type: Boolean, default: true },
  },
  opts,
);
enrollmentSchema.index({ student: 1, subject: 1 }, { unique: true });
const assignmentSubmissionSchema = new Schema(
  {
    assignment: Schema.Types.ObjectId,
    student: Schema.Types.ObjectId,
    fileName: String,
    storagePath: String,
    submittedAt: Date,
    status: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'LATE', 'EVALUATED', 'RETURNED'],
      default: 'PENDING',
    },
    marks: Number,
    feedback: String,
  },
  opts,
);
assignmentSubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });
const assignmentSchema = new Schema(
  {
    subject: Schema.Types.ObjectId,
    creator: Schema.Types.ObjectId,
    title: String,
    description: String,
    dueAt: Date,
    maxMarks: Number,
    allowedMimeTypes: [String],
    maxFileBytes: Number,
    allowResubmission: Boolean,
  },
  opts,
);
const roomSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    assessment: Schema.Types.ObjectId,
    teacher: Schema.Types.ObjectId,
    status: { type: String, enum: ['WAITING', 'LIVE', 'PAUSED', 'ENDED', 'EXPIRED'], default: 'WAITING' },
    eligibleStudents: [Schema.Types.ObjectId],
    expiresAt: Date,
    participants: [Schema.Types.ObjectId],
  },
  opts,
);
const reviewSchema = new Schema(
  {
    grade: Schema.Types.ObjectId,
    student: Schema.Types.ObjectId,
    message: String,
    status: { type: String, enum: ['OPEN', 'APPROVED', 'REJECTED'], default: 'OPEN' },
    response: String,
    resolvedBy: Schema.Types.ObjectId,
  },
  opts,
);
const calendarSchema = new Schema(
  {
    title: String,
    description: String,
    subject: Schema.Types.ObjectId,
    startAt: Date,
    endAt: Date,
    type: String,
    createdBy: Schema.Types.ObjectId,
  },
  opts,
);
const academicYearSchema = new Schema(
  {
    label: { type: String, required: true, unique: true },
    startsAt: Date,
    endsAt: Date,
    isActive: { type: Boolean, default: false },
    archivedAt: Date,
  },
  opts,
);
const semesterSchema = new Schema(
  {
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    number: { type: Number, min: 1, max: 12, required: true },
    name: String,
    startsAt: Date,
    endsAt: Date,
    isActive: { type: Boolean, default: false },
  },
  opts,
);
semesterSchema.index({ academicYear: 1, number: 1 }, { unique: true });
const sectionSchema = new Schema(
  {
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    semester: { type: Schema.Types.ObjectId, ref: 'Semester', required: true },
    name: { type: String, required: true },
  },
  opts,
);
sectionSchema.index({ department: 1, academicYear: 1, semester: 1, name: 1 }, { unique: true });
const teacherAssignmentSchema = new Schema(
  {
    teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    role: { type: String, enum: ['coordinator', 'primary', 'additional'], default: 'primary' },
    active: { type: Boolean, default: true },
    assignedAt: Date,
    endedAt: Date,
  },
  opts,
);
teacherAssignmentSchema.index({ teacher: 1, subject: 1, role: 1 }, { unique: true });
const questionBankSchema = new Schema(
  {
    name: { type: String, required: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questions: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
    archivedAt: Date,
  },
  opts,
);
const templateSchema = new Schema(
  { owner: Schema.Types.ObjectId, title: String, config: Schema.Types.Mixed },
  opts,
);
export const User = model('User', userSchema);
export const Department = model('Department', departmentSchema);
export const Subject = model('Subject', subjectSchema);
export const Question = model('Question', questionSchema);
export const Assessment = model('Assessment', assessmentSchema);
export const Attempt = model('Attempt', attemptSchema);
export const Grade = model('Grade', gradeSchema);
export const AuditLog = model('AuditLog', auditSchema);
export const Announcement = model('Announcement', announcementSchema);
export const Notification = model('Notification', notificationSchema);
export const Enrollment = model('Enrollment', enrollmentSchema);
export const Assignment = model('Assignment', assignmentSchema);
export const AssignmentSubmission = model('AssignmentSubmission', assignmentSubmissionSchema);
export const Room = model('Room', roomSchema);
export const GradeReviewRequest = model('GradeReviewRequest', reviewSchema);
export const AcademicCalendarEvent = model('AcademicCalendarEvent', calendarSchema);
export const AssessmentTemplate = model('AssessmentTemplate', templateSchema);
export const AcademicYear = model('AcademicYear', academicYearSchema);
export const Semester = model('Semester', semesterSchema);
export const Section = model('Section', sectionSchema);
export const TeacherAssignment = model('TeacherAssignment', teacherAssignmentSchema);
export const QuestionBank = model('QuestionBank', questionBankSchema);
