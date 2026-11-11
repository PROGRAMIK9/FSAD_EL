import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.ALLOWED_EMAIL_DOMAINS = 'rvce.edu.in';
process.env.ALLOWED_EMAILS = 'guest@gmail.com';

const { AuditLog, Enrollment, Subject, User } = await import('../src/models/index.js');
const { isAllowedEmail, resolveGoogleUser } = await import('../src/services/auth.js');

/** Stubs the enrolment queries so tests never touch a database. */
const stubEnrolment = (subjects = []) => ({
  find: mock.method(Subject, 'find', () => ({ select: () => ({ lean: async () => subjects }) })),
  update: mock.method(Subject, 'updateMany', async () => ({})),
  bulk: mock.method(Enrollment, 'bulkWrite', async () => ({})),
});

const fakeUser = (fields) => ({
  id: 'u1',
  _id: 'u1',
  isActive: true,
  approvalStatus: 'approved',
  save: async () => {},
  ...fields,
});

test('allowed domains and allowlisted emails are accepted, others are not', () => {
  assert.equal(isAllowedEmail('asha.cs23@rvce.edu.in'), true);
  assert.equal(isAllowedEmail('GUEST@gmail.com'), true);
  assert.equal(isAllowedEmail('someone@gmail.com'), false);
  assert.equal(isAllowedEmail('x@evil-rvce.edu.in'), false);
});

test('a first sign-in from an allowed domain creates an active student', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(User, 'findOne', async () => null);
  const create = mock.method(User, 'create', async (doc) => fakeUser(doc));
  const audit = mock.method(AuditLog, 'create', async () => ({}));
  const r = await resolveGoogleUser({
    email: 'Asha.Rao@rvce.edu.in',
    email_verified: true,
    sub: 'g-1',
    name: 'Asha Rao',
  });
  assert.equal(r.created, true);
  assert.ok(r.token);
  const doc = create.mock.calls[0].arguments[0];
  assert.deepEqual(
    {
      email: doc.email,
      name: doc.name,
      role: doc.role,
      isActive: doc.isActive,
      approvalStatus: doc.approvalStatus,
      googleId: doc.googleId,
    },
    {
      email: 'asha.rao@rvce.edu.in',
      name: 'Asha Rao',
      role: 'student',
      isActive: true,
      approvalStatus: 'approved',
      googleId: 'g-1',
    },
  );
  assert.equal(audit.mock.calls[0].arguments[0].action, 'USER_SELF_REGISTERED');
});

test('a missing Google name falls back to the email', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(User, 'findOne', async () => null);
  const create = mock.method(User, 'create', async (doc) => fakeUser(doc));
  mock.method(AuditLog, 'create', async () => ({}));
  stubEnrolment();
  await resolveGoogleUser({ email: 'ravi.kumar_cs@rvce.edu.in', email_verified: true, sub: 'g-2' });
  assert.equal(create.mock.calls[0].arguments[0].name, 'Ravi Kumar Cs');
});

test('existing accounts keep their role and are not recreated', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(User, 'findOne', async () => fakeUser({ email: 'teacher@rvce.edu.in', role: 'teacher' }));
  const create = mock.method(User, 'create', async () => assert.fail('should not create'));
  const r = await resolveGoogleUser({ email: 'teacher@rvce.edu.in', email_verified: true, sub: 'g-3' });
  assert.equal(r.created, false);
  assert.equal(r.user.role, 'teacher');
  assert.equal(create.mock.callCount(), 0);
});

test('disabled or rejected accounts stay blocked', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(User, 'findOne', async () => fakeUser({ approvalStatus: 'rejected' }));
  await assert.rejects(resolveGoogleUser({ email: 'x@rvce.edu.in', email_verified: true }), { status: 403 });
  mock.restoreAll();
  mock.method(User, 'findOne', async () => fakeUser({ isActive: false }));
  await assert.rejects(resolveGoogleUser({ email: 'x@rvce.edu.in', email_verified: true }), { status: 403 });
});

test('unverified or outside-domain emails never create accounts', async (t) => {
  t.after(() => mock.restoreAll());
  const create = mock.method(User, 'create', async () => assert.fail('should not create'));
  await assert.rejects(resolveGoogleUser({ email: 'a@rvce.edu.in', email_verified: false }), { status: 401 });
  await assert.rejects(resolveGoogleUser({ email: 'a@gmail.com', email_verified: true }), { status: 403 });
  assert.equal(create.mock.callCount(), 0);
});

test('a concurrent first sign-in reuses the account the other request created', async (t) => {
  t.after(() => mock.restoreAll());
  let calls = 0;
  mock.method(User, 'findOne', async () =>
    calls++ ? fakeUser({ email: 'a@rvce.edu.in', role: 'student' }) : null,
  );
  mock.method(User, 'create', async () => {
    throw Object.assign(new Error('dup'), { code: 11000 });
  });
  const r = await resolveGoogleUser({ email: 'a@rvce.edu.in', email_verified: true, sub: 'g-4' });
  assert.equal(r.created, false);
  assert.equal(r.user.role, 'student');
});

test('a new student is enrolled in every auto-enrol subject', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(User, 'findOne', async () => null);
  mock.method(User, 'create', async (doc) => fakeUser({ ...doc, _id: 'new-student' }));
  mock.method(AuditLog, 'create', async () => ({}));
  const s = stubEnrolment([
    { _id: 'fsad', academicYear: '2026-27' },
    { _id: 'devops', academicYear: '2026-27' },
  ]);
  await resolveGoogleUser({
    email: 'new.mca25@rvce.edu.in',
    email_verified: true,
    sub: 'g-5',
    name: 'New Student',
  });
  assert.deepEqual(s.find.mock.calls[0].arguments[0], { autoEnroll: true, archivedAt: null });
  assert.deepEqual(s.update.mock.calls[0].arguments, [
    { _id: { $in: ['fsad', 'devops'] } },
    { $addToSet: { students: 'new-student' } },
  ]);
  const ops = s.bulk.mock.calls[0].arguments[0];
  assert.equal(ops.length, 2);
  assert.deepEqual(ops[0].updateOne.filter, { student: 'new-student', subject: 'fsad' });
  assert.equal(ops[0].updateOne.upsert, true);
});

test('existing users are not re-enrolled, and an email-derived name is replaced by the Google name', async (t) => {
  t.after(() => mock.restoreAll());
  const user = fakeUser({ email: 'maaryamannp.mca25@rvce.edu.in', name: 'Maaryamannp', role: 'admin' });
  mock.method(User, 'findOne', async () => user);
  const s = stubEnrolment([{ _id: 'fsad', academicYear: '2026-27' }]);
  await resolveGoogleUser({
    email: 'maaryamannp.mca25@rvce.edu.in',
    email_verified: true,
    sub: 'g-6',
    name: 'Aaryamann P',
  });
  assert.equal(user.name, 'Aaryamann P');
  assert.equal(user.role, 'admin');
  assert.equal(s.update.mock.callCount(), 0);
});

test('a real name chosen by an administrator is kept', async (t) => {
  t.after(() => mock.restoreAll());
  const user = fakeUser({ email: 'asha.rao@rvce.edu.in', name: 'Dr. Asha Rao', role: 'teacher' });
  mock.method(User, 'findOne', async () => user);
  await resolveGoogleUser({
    email: 'asha.rao@rvce.edu.in',
    email_verified: true,
    sub: 'g-7',
    name: 'Asha R',
  });
  assert.equal(user.name, 'Dr. Asha Rao');
});

test('email-derived names skip batch codes', async () => {
  const { nameFromEmail } = await import('../src/services/auth.js');
  assert.equal(nameFromEmail('maaryamannp.mca25@rvce.edu.in'), 'Maaryamannp');
  assert.equal(nameFromEmail('asha.rao.cs23@rvce.edu.in'), 'Asha Rao');
  assert.equal(nameFromEmail('1rv25mc001@rvce.edu.in'), '1rv25mc001');
});
