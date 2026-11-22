import { test, expect } from './fixtures.js';

/**
 * The calendar board: a teacher drags a scheduled quiz to another day (the quiz moves too and
 * students are told), reschedules a date with the keyboard, cannot move announcements; students
 * see a read-only board.
 */
const USERS = { teacher: 'e2e.teacher@rvce.edu.in', student: 'e2e.student1.mca25@rvce.edu.in' };

test.describe.configure({ mode: 'serial' });

async function signIn(page, email) {
  await page.context().clearCookies();
  const res = await page.request.post('/api/auth/dev-login', { data: { email } });
  expect(res.ok(), `dev sign-in for ${email}`).toBeTruthy();
}
async function api(page, method, path, data) {
  const res = await page.request[method](`/api${path}`, data ? { data } : undefined);
  const body = await res.json();
  expect(body.ok, `${method.toUpperCase()} ${path}: ${body.error}`).toBeTruthy();
  return body.data;
}
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Monday of next week, 00:00 local. */
function nextMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7);
  return d;
}
const at = (base, days, h, m = 0) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d;
};

const ids = {};
const monday = nextMonday();

test('teacher drags a scheduled quiz to another day', async ({ page }) => {
  await signIn(page, USERS.teacher);
  const subject = (await api(page, 'get', '/subjects')).find((s) => s.code === 'MCA261IA');
  const q = await api(page, 'post', '/questions', { subject: subject._id, type: 'fill_blank', text: 'Calendar e2e: capital of Karnataka?', marks: 10, correctAnswer: 'Bengaluru' });
  const start = at(monday, 2, 10); // Wednesday 10:00
  const quiz = await api(page, 'post', '/assessments', {
    subject: subject._id,
    title: 'Board quiz (e2e)',
    questionIds: [q._id],
    durationMinutes: 30,
    availabilityMode: 'scheduled',
    startsAt: start.toISOString(),
    endsAt: at(monday, 2, 11).toISOString(),
    publish: true,
  });
  ids.quiz = quiz._id;
  const plain = await api(page, 'post', '/calendar/events', { title: 'Board seminar (e2e)', subject: subject._id, type: 'Academic date', startAt: at(monday, 1, 14).toISOString() });
  ids.plain = plain._id;

  await page.goto('/calendar');
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  const events = await api(page, 'get', `/calendar/events?from=${monday.toISOString()}&to=${at(monday, 7, 0).toISOString()}`);
  const quizEvent = events.find((e) => e.title === 'Board quiz (e2e)');
  expect(quizEvent.canMove).toBe(true);
  expect(quizEvent.link.kind).toBe('assessment');
  ids.quizEvent = quizEvent._id;

  const card = page.locator(`[data-event-id="${quizEvent._id}"]`);
  await expect(page.locator(`[data-day="${dayKey(at(monday, 2, 0))}"]`).locator(card)).toBeVisible();
  await card.dragTo(page.locator(`[data-day="${dayKey(at(monday, 4, 0))}"]`)); // to Friday
  await page.getByRole('dialog').getByRole('button', { name: 'Move quiz' }).click();
  await expect(page.locator(`[data-day="${dayKey(at(monday, 4, 0))}"]`).locator(card)).toBeVisible();

  const moved = await api(page, 'get', `/assessments/${ids.quiz}`);
  expect(new Date(moved.startsAt).getTime()).toBe(at(monday, 4, 10).getTime());
  expect(new Date(moved.endsAt).getTime()).toBe(at(monday, 4, 11).getTime());
});

test('teacher reschedules with the keyboard; announcements stay put', async ({ page }) => {
  await signIn(page, USERS.teacher);
  await page.goto('/calendar');
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Reschedule Board seminar (e2e)' }).click();
  const target = at(monday, 3, 9, 30); // Thursday 09:30
  await page.getByLabel('New date and time').fill(`${dayKey(target)}T09:30`);
  await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
  await expect(page.locator(`[data-day="${dayKey(target)}"]`).getByText('Board seminar (e2e)')).toBeVisible();

  const subject = (await api(page, 'get', '/subjects')).find((s) => s.code === 'MCA261IA');
  await api(page, 'post', '/announcements', { subject: subject._id, title: 'Board notice (e2e)', body: 'Hello class' });
  const now = new Date();
  const events = await api(page, 'get', `/calendar/events?from=${at(now, -1, 0).toISOString()}&to=${at(now, 1, 0).toISOString()}`);
  const notice = events.find((e) => e.title === 'Board notice (e2e)');
  expect(notice.canMove).toBe(false);
  expect(notice.moveBlocker).toMatch(/Announcements/);
});

test('students see a read-only board', async ({ page }) => {
  await signIn(page, USERS.student);
  await page.goto('/calendar');
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  const card = page.locator(`[data-event-id="${ids.quizEvent}"]`);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('draggable', 'false');
  await expect(page.getByRole('button', { name: /Reschedule/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add event' })).toHaveCount(0);
  const res = await page.request.patch(`/api/calendar/events/${ids.quizEvent}`, { data: { startAt: new Date().toISOString() } });
  expect(res.status()).toBe(403);
});

test('the official academic calendar is on the board', async ({ page }) => {
  await signIn(page, USERS.student);
  const events = await api(page, 'get', `/calendar/events?from=${new Date(2026, 9, 1).toISOString()}&to=${new Date(2026, 10, 1).toISOString()}`);
  const cie1 = events.find((e) => e.title === 'CIE-I');
  expect(cie1).toMatchObject({ type: 'CIE', allDay: true, subject: null });
  await page.goto('/calendar');
  await page.getByRole('tab', { name: 'Month' }).click();
  // Navigate to October 2026.
  for (let i = 0; i < 24 && !(await page.getByRole('heading', { name: 'October 2026' }).count()); i++) {
    const now = await page.getByRole('heading', { name: /\d{4}$/ }).first().textContent();
    await page.getByRole('button', { name: new Date(`1 ${now}`) > new Date(2026, 9, 1) ? 'Previous' : 'Next' }).click();
  }
  for (const d of ['2026-10-14', '2026-10-15', '2026-10-16'])
    await expect(page.locator(`[data-day="${d}"]`).getByText('CIE-I', { exact: false })).toBeVisible();
  // Staff (admin) only: teachers cannot move institution-wide dates.
  await signIn(page, USERS.teacher);
  const asTeacher = await api(page, 'get', `/calendar/events?from=${new Date(2026, 9, 1).toISOString()}&to=${new Date(2026, 10, 1).toISOString()}`);
  expect(asTeacher.find((e) => e.title === 'CIE-I').moveBlocker).toMatch(/administrators/);
});
