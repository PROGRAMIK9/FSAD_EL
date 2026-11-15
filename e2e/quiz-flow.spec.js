import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';

/**
 * The full CIE quiz cycle in one ordered flow, using the real MCA seed:
 * elective choice -> teacher opens Quiz 1 -> student writes it -> teacher ends it,
 * publishes and exports results -> student questions a mark -> teacher resolves it
 * -> teacher enters and publishes CIE marks -> student sees "My CIE".
 */
const USERS = {
  teacher: 'e2e.teacher@rvce.edu.in',
  student: 'e2e.student1.mca25@rvce.edu.in',
};
const QUIZ_TITLE = 'MCA261IA Quiz 1: Units I-II';

test.describe.configure({ mode: 'serial' });

/** Signs in through the development sign-in endpoint; the cookie is shared with the page. */
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

const ids = {};

test('student chooses the Group D elective', async ({ page }) => {
  await signIn(page, USERS.student);
  await page.goto('/');
  await expect(page.getByText('Choose your Group D elective')).toBeVisible();
  await page.getByRole('button', { name: 'Choose now' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /Advanced Computer Networks/ }).click();
  await dialog.getByRole('button', { name: 'Enrol in MCA263D3' }).click();
  await expect(page.getByText('You are enrolled in Advanced Computer Networks')).toBeVisible();
  await expect(page.getByText('Choose your Group D elective')).toHaveCount(0);
  const subjects = await api(page, 'get', '/subjects');
  expect(subjects.map((s) => s.code)).toContain('MCA263D3');
  expect(subjects.map((s) => s.code)).not.toContain('MCA263D1');
});

test('teacher opens Quiz 1, which counts as CIE Quiz 1', async ({ page }) => {
  await signIn(page, USERS.teacher);
  const quiz = (await api(page, 'get', '/assessments')).find((a) => a.title === QUIZ_TITLE);
  expect(quiz.cieSlot).toBe('QUIZ1');
  ids.quiz = quiz._id;
  ids.subject = quiz.subject._id;
  await api(page, 'patch', `/assessments/${quiz._id}`, { availabilityMode: 'instant' });
  await api(page, 'post', `/assessments/${quiz._id}/publish`);
  await page.goto('/assessments');
  const row = page.getByRole('listitem').filter({ hasText: QUIZ_TITLE });
  await expect(row.getByText('Open', { exact: true })).toBeVisible();
});

test('student writes and submits the quiz on the proctored exam screen', async ({ page }) => {
  await signIn(page, USERS.student);
  await page.goto(`/exam/${ids.quiz}`);
  await page.getByText("I have read the rules and I'm ready to start.").click();
  await page.getByRole('button', { name: /Start quiz/ }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  for (let i = 0; i < 10; i++) {
    const options = page.locator('fieldset label');
    if (await options.count()) await options.first().click();
    else await page.getByLabel(`Answer for question ${i + 1}`).fill('answer');
    if (i < 9) await page.getByRole('button', { name: /^Next/ }).click();
  }
  await expect(page.getByText(/Saved/)).toBeVisible();
  await page.getByRole('button', { name: /Review & submit/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit now' }).click();
  await expect(page.getByRole('heading', { name: 'Quiz submitted' })).toBeVisible();
});

test('teacher ends the quiz, publishes the result and exports the workbook', async ({ page }) => {
  await signIn(page, USERS.teacher);
  await page.goto(`/assessments/${ids.quiz}/monitor`);
  await expect(
    page.getByRole('row').filter({ hasText: 'Asha Rao' }).getByText('Submitted', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'End quiz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End quiz' }).click();
  await expect(page.getByText('Quiz ended')).toBeVisible();

  await page.goto('/evaluation');
  await page.getByRole('button', { name: /Publish all/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish all' }).click();
  await expect(page.getByText(/Result published|Published 1 results/)).toBeVisible();

  await page.getByRole('button', { name: /^Export/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Excel workbook/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^mca261ia-quiz-1-units-i-ii-results\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await download.path()));
  expect(wb.worksheets.map((w) => w.name)).toEqual(['Results', 'Question breakdown', 'Summary']);
  const results = wb.getWorksheet('Results');
  expect(results.getRow(1).values.slice(1, 4)).toEqual(['Student', 'USN', 'Email']);
  const asha = results.getColumn(1).values.findIndex((v) => v === 'Asha Rao');
  expect(results.getRow(asha).getCell(4).value).toBe('Submitted');
});

test('student questions a mark and the teacher accepts it', async ({ page }) => {
  await signIn(page, USERS.student);
  await page.goto(`/results/${ids.quiz}`);
  await expect(page.getByText('Answer review')).toBeVisible();
  ids.before = Number(
    await page
      .getByRole('img', { name: /^Score/ })
      .getAttribute('aria-label')
      .then((l) => l.match(/Score ([\d.]+)/)[1]),
  );
  await page.getByRole('button', { name: 'Question a mark' }).click();
  const ask = page.getByRole('dialog');
  await ask.getByRole('textbox').fill('Q2: my answer matches the explanation. Please recheck.');
  await ask.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Review requested')).toBeVisible();

  await signIn(page, USERS.teacher);
  await page.goto('/reviews');
  const card = page.getByRole('article').filter({ hasText: 'Asha Rao' });
  await card.getByRole('button', { name: 'Respond' }).click();
  const drawer = page.getByRole('dialog');
  const corrected = Math.min(10, ids.before + 1);
  await drawer.getByLabel('Corrected mark').fill(String(corrected));
  await drawer.getByLabel(/Reply to the student/).fill('Q2 accepted after review. One mark added.');
  await drawer.getByRole('button', { name: 'Accept and reply' }).click();
  await expect(page.getByText('No open requests')).toBeVisible();

  await signIn(page, USERS.student);
  await page.goto(`/results/${ids.quiz}`);
  await expect(page.getByText('Review accepted')).toBeVisible();
  await expect(page.getByText('Q2 accepted after review. One mark added.')).toBeVisible();
  await expect(page.getByRole('img', { name: `Score ${corrected} out of 10` })).toBeVisible();
});

test('teacher enters CIE marks and publishes; the student sees My CIE', async ({ page }) => {
  await signIn(page, USERS.teacher);
  await page.goto(`/subjects/${ids.subject}/cie`);
  const marks = { 'Test 1': 40, 'Test 2': 35, 'EL I': 18, 'EL II': 16, 'Lab record': 36, 'Lab test': 9 };
  for (const [label, value] of Object.entries(marks)) {
    const cell = page.getByLabel(`${label} for Asha Rao`);
    await cell.fill(String(value));
    await cell.press('Enter');
    await expect(cell).toHaveValue(String(value));
  }
  const row = page.getByRole('row').filter({ hasText: 'Asha Rao' });
  await expect(row.getByText('30', { exact: true })).toBeVisible(); // tests: (40 + 35) / 100 * 40
  await page.getByRole('button', { name: 'Publish to students' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('CIE marks published')).toBeVisible();

  await signIn(page, USERS.student);
  await page.goto(`/subjects/${ids.subject}`);
  const card = page.locator('.card').filter({ hasText: 'My CIE' });
  await expect(card.getByText('30/40')).toBeVisible();
  await expect(card.getByText('34/40')).toBeVisible();
  await expect(card.getByText('45/50')).toBeVisible();
});

test('every page refuses a signed-out visitor', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/subjects');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect((await page.request.get('/api/subjects')).status()).toBe(401);
});
