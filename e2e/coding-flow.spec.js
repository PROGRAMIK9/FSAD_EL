import { test, expect, openQuestionBank } from './fixtures.js';

/**
 * The coding environment end to end, on the fake judge, or on real compilers when RUNNER_URL
 * points at a code runner (see runner/README.md):
 * a teacher writes a coding question in the question bank, puts it in a Lab that counts as
 * the CIE lab test, a student solves it in the proctored editor (run, submit, finish), the
 * code is graded after submission, and the problem is open in the practice area.
 */
const USERS = {
  teacher: 'e2e.teacher@rvce.edu.in',
  student: 'e2e.student1.mca25@rvce.edu.in',
};
const TITLE = 'Sum of two numbers (e2e)';
const LAB = 'Lab 1: Basics (e2e)';

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

/** Replaces the code in the CodeMirror editor (the first one on the page by default). */
async function typeCode(page, code, editor = page.locator('[data-code-editor] .cm-content').first()) {
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
}

const ids = {};

test('teacher writes a coding question with sample and hidden tests', async ({ page }) => {
  await signIn(page, USERS.teacher);
  const subjects = await api(page, 'get', '/subjects');
  const subject = subjects.find((s) => s.code === 'MCA261IA') || subjects[0];
  ids.subject = subject._id;

  await openQuestionBank(page);
  await page.getByRole('button', { name: 'New question' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Subject').selectOption(subject._id);
  await dialog.getByRole('button', { name: 'Coding' }).click();
  await dialog.getByLabel('Problem statement').fill(`${TITLE}\nRead two integers and print their sum.`);
  await dialog.getByLabel('Test 1 input').fill('1 2');
  await dialog.getByLabel('Test 1 expected output').fill('3');
  await dialog.getByLabel('Test 2 input').fill('40 2');
  await dialog.getByLabel('Test 2 expected output').fill('42');
  await dialog.getByRole('button', { name: 'Add test case' }).click();
  await dialog.getByLabel('Test 3 input').fill('-5 5');
  await dialog.getByLabel('Test 3 expected output').fill('0');
  await dialog.getByLabel('Marks').fill('10');
  await dialog.getByText('Open for practice').click();
  await dialog.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('Question added')).toBeVisible();

  const questions = await api(page, 'get', `/questions?subject=${subject._id}&type=code`);
  const q = questions.find((x) => x.text.startsWith(TITLE));
  expect(q.code.testCases.map((t) => t.hidden)).toEqual([false, true, true]);
  expect(q.code.languages).toEqual(['c', 'cpp', 'java', 'python']);
  ids.question = q._id;
});

test('teacher checks a reference solution against every test', async ({ page }) => {
  await signIn(page, USERS.teacher);
  const run = await api(page, 'post', '/code/submit', { questionId: ids.question, language: 'python', source: 'a, b = map(int, input().split())\nprint(a + b)\n' });
  let result;
  await expect(async () => {
    result = await api(page, 'get', `/code/runs/${run.runId}`);
    expect(result.status).toBe('done');
  }).toPass();
  expect(result.results).toHaveLength(3);
  expect(result.results.every((r) => r.status === 'AC')).toBe(true);
  // Staff see hidden tests' output.
  expect(result.results[1].stdout.trim()).toBe('42');
});

test('teacher opens a Lab that counts as the CIE lab test', async ({ page }) => {
  await signIn(page, USERS.teacher);
  const quizOnly = await page.request.post('/api/assessments', {
    data: { subject: ids.subject, title: 'Not allowed', questionIds: [ids.question], durationMinutes: 30, availabilityMode: 'instant' },
  });
  expect((await quizOnly.json()).error).toMatch(/Use a Lab/);
  const lab = await api(page, 'post', '/assessments', {
    subject: ids.subject,
    title: LAB,
    category: 'Lab',
    questionIds: [ids.question],
    durationMinutes: 30,
    availabilityMode: 'instant',
    publish: true,
  });
  expect(lab.category).toBe('Lab');
  ids.lab = lab._id;
});

test('student solves the problem in the proctored editor and submits', async ({ page }) => {
  await signIn(page, USERS.student);
  await page.goto(`/exam/${ids.lab}`);
  await page.getByText("I have read the rules and I'm ready to start.").click();
  await page.getByRole('button', { name: /Start quiz/ }).click();
  await expect(page.getByText('Write a program')).toBeVisible();
  await expect(page.getByText('2 hidden tests also run when you submit.')).toBeVisible();
  // Hidden test data never reaches the browser.
  await expect(page.getByText('40 2')).toHaveCount(0);

  await page.getByLabel('Language').selectOption('python');
  await typeCode(page, '# FAKE:WA\nprint(0)\n');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('0/1 test passed', { exact: true })).toBeVisible();
  await expect(page.getByText('Wrong answer')).toBeVisible();

  await typeCode(page, 'a, b = map(int, input().split())\nprint(a + b)\n');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('1/1 test passed', { exact: true })).toBeVisible();
  // Screen readers hear the result.
  await expect(page.getByRole('status').filter({ hasText: 'Run finished: 1/1 test passed.' })).toBeAttached();
  await page.getByRole('button', { name: 'Submit code' }).click();
  await expect(page.getByText('3/3 tests passed', { exact: true })).toBeVisible();
  await expect(page.getByText('Hidden test 2')).toBeVisible();

  await expect(page.getByText(/Saved/)).toBeVisible();
  await page.getByRole('button', { name: /Review & submit/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit now' }).click();
  await expect(page.getByRole('heading', { name: 'Quiz submitted' })).toBeVisible();
});

test('the submitted code is graded and fills the lab grade', async ({ page }) => {
  await signIn(page, USERS.teacher);
  let row;
  await expect(async () => {
    const monitor = await api(page, 'get', `/assessments/${ids.lab}/monitor`);
    row = monitor.roster.find((r) => r.attempt && r.attempt.state !== 'IN_PROGRESS');
    expect(row?.attempt?.gradingStatus).toBe('done');
  }).toPass({ timeout: 20_000 });
  expect(row.attempt.score).toBe(10);

  const review = await api(page, 'get', `/attempts/${row.attempt.id}`);
  const item = review.items[0];
  expect(item.type).toBe('code');
  expect(item.status).toBe('correct');
  expect(item.awarded).toBe(10);
  expect(item.given.language).toBe('python');
});

test('the problem is open for practice', async ({ page }) => {
  await signIn(page, USERS.student);
  await page.goto('/practice');
  await page.getByRole('link', { name: new RegExp(TITLE.replace(/[()]/g, '\\$&')) }).click();
  await expect(page.getByText('Read two integers and print their sum.')).toBeVisible();
  await page.getByLabel('Language').selectOption('cpp');
  await typeCode(page, '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}\n');
  await page.getByRole('button', { name: 'Submit code' }).click();
  await expect(page.getByText('3/3 tests passed', { exact: true })).toBeVisible();

  await page.goto('/practice/playground');
  await typeCode(page, 'print(input())\n');
  await page.getByLabel('Language').selectOption('python');
  await typeCode(page, 'print(input())\n');
  await page.getByLabel(/^Input/).fill('hello');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('pre').filter({ hasText: 'hello' })).toBeVisible();
});
