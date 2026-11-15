import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { Enrollment, Subject, User } = await import('../src/models/index.js');
const { chooseElective, electiveGroupsFor } = await import('../src/services/electives.js');

const id = () => new mongoose.Types.ObjectId();
const lean = (value) => ({
  select: () => ({ sort: () => ({ lean: async () => value }), lean: async () => value }),
});

test('choosing an elective enrols in it and removes the other options of the group', async (t) => {
  t.after(() => mock.restoreAll());
  const [d1, d2, d3] = [id(), id(), id()];
  const student = { _id: id() };
  mock.method(Subject, 'findOne', () => ({
    select: async () => ({ _id: d2, electiveGroup: 'D', academicYear: '2026-27' }),
  }));
  mock.method(Subject, 'find', () => ({ select: async () => [{ _id: d1 }, { _id: d2 }, { _id: d3 }] }));
  const pull = mock.method(Subject, 'updateMany', async () => ({}));
  const add = mock.method(Subject, 'updateOne', async () => ({}));
  const deactivate = mock.method(Enrollment, 'updateMany', async () => ({}));
  const upsert = mock.method(Enrollment, 'updateOne', async () => ({}));
  const record = mock.method(User, 'updateOne', async () => ({}));
  const r = await chooseElective(student, String(d2));
  assert.deepEqual(r, { group: 'D', subject: String(d2) });
  assert.deepEqual(pull.mock.calls[0].arguments, [
    { _id: { $in: [d1, d3] } },
    { $pull: { students: student._id } },
  ]);
  assert.deepEqual(add.mock.calls[0].arguments, [{ _id: d2 }, { $addToSet: { students: student._id } }]);
  assert.deepEqual(deactivate.mock.calls[0].arguments[1], { $set: { active: false } });
  assert.equal(upsert.mock.calls[0].arguments[2].upsert, true);
  assert.deepEqual(record.mock.calls[0].arguments[1], { $set: { 'electives.D': d2 } });
});

test('a locked group refuses new choices', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(Subject, 'findOne', () => ({ select: async () => ({ _id: id(), electiveGroup: 'D' }) }));
  mock.method(Subject, 'find', () => ({ select: async () => [{ _id: id(), electiveLockedAt: new Date() }] }));
  const pull = mock.method(Subject, 'updateMany', async () => ({}));
  await assert.rejects(chooseElective({ _id: id() }, String(id())), { status: 409 });
  assert.equal(pull.mock.callCount(), 0);
});

test('a non-elective subject cannot be chosen', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(Subject, 'findOne', () => ({ select: async () => ({ _id: id(), electiveGroup: null }) }));
  await assert.rejects(chooseElective({ _id: id() }, String(id())), { status: 400 });
});

test('the current choice comes from the recorded choice or a single allocation', async (t) => {
  t.after(() => mock.restoreAll());
  const student = { _id: id() };
  const [a, b] = [id(), id()];
  const subjects = [
    {
      _id: a,
      code: 'MCA263D1',
      name: 'IoT',
      electiveGroup: 'D',
      students: [],
      syllabus: { units: [{ title: 'Unit one' }] },
    },
    {
      _id: b,
      code: 'MCA263D2',
      name: 'DL',
      electiveGroup: 'D',
      students: [student._id],
      syllabus: { units: [] },
    },
  ];
  mock.method(Subject, 'find', () => lean(subjects));
  let [g] = await electiveGroupsFor(student);
  assert.equal(g.choice, String(b));
  assert.deepEqual(g.options[0].units, ['Unit one']);
  assert.equal(g.locked, false);
  [g] = await electiveGroupsFor({ ...student, electives: new Map([['D', a]]) });
  assert.equal(g.choice, String(a));
});
