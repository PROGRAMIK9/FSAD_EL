import { test, expect, openQuestionBank } from './fixtures.js';

/**
 * Custom LeetCode-style questions: a teacher builds a function question in the editor (signature,
 * generated drivers, tests imported as JSON), exports it and imports it into another subject;
 * a student practises it and sees the signature. Uses the fake judge unless RUNNER_URL is set.
 */
const USERS = { teacher: 'e2e.teacher@rvce.edu.in', student: 'e2e.student1.mca25@rvce.edu.in' };
const TITLE = 'Two Sum (e2e)';

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

const ids = {};

test('teacher builds a LeetCode-style function question', async ({ page }) => {
  await signIn(page, USERS.teacher);
  const subjects = await api(page, 'get', '/subjects');
  const subject = subjects.find((s) => s.code === 'MCA261IA') || subjects[0];
  ids.subject = subject._id;
  ids.other = subjects.find((s) => s._id !== subject._id)._id;

  await openQuestionBank(page);
  await page.getByRole('button', { name: 'New question' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Subject').selectOption(subject._id);
  await dialog.getByRole('button', { name: 'Coding' }).click();
  await dialog.getByLabel('Problem statement').fill(`${TITLE}\nReturn the indices of the two numbers that add up to target.`);
  await dialog.getByRole('button', { name: /^Function/ }).click();
  await dialog.getByLabel('Function name').fill('twoSum');
  await dialog.getByLabel('Return type').selectOption('int[]');
  await dialog.getByRole('button', { name: 'Add parameter' }).click();
  await dialog.getByLabel('Parameter 2 name').fill('target');
  await dialog.getByLabel('Parameter 2 type').selectOption('int');
  await expect(dialog.getByText('twoSum(nums: int[], target: int) → int[]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Generate starter & drivers' }).click();
  await expect(page.getByText('Starter code and drivers generated')).toBeVisible();
  await expect(dialog.getByText('Hidden from students')).toBeVisible();

  await dialog.getByRole('button', { name: 'Import tests' }).click();
  await dialog
    .getByLabel('Tests as JSON')
    .fill(JSON.stringify([
      { input: '[2,7,11,15]\n9', output: '[0,1]' },
      { input: '[3,2,4]\n6', output: '[1,2]' },
      { input: '[3,3]\n6', output: '[0,1]' },
    ]));
  await dialog.getByRole('button', { name: 'Read JSON' }).click();
  await expect(dialog.getByText('3 tests found')).toBeVisible();
  await dialog.getByRole('button', { name: 'Import 3' }).click();
  await expect(dialog.getByText('Test cases (3/50)')).toBeVisible();

  await dialog.getByLabel('Marks').fill('10');
  await dialog.getByText('Open for practice').click();
  await dialog.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('Question added')).toBeVisible();

  const list = await api(page, 'get', `/questions?subject=${subject._id}&type=code`);
  const q = list.find((x) => x.text.startsWith(TITLE));
  expect(q.code.mode).toBe('function');
  expect(q.code.signature).toMatchObject({ name: 'twoSum', returns: 'int[]' });
  expect(Object.keys(q.code.drivers).sort()).toEqual(['c', 'cpp', 'java', 'python']);
  expect(q.code.drivers.java).toContain('@@USER_CODE@@');
  expect(q.code.testCases.map((t) => t.hidden)).toEqual([false, true, true]);
  ids.question = q._id;
});

test('a correct function solution passes every test', async ({ page }) => {
  await signIn(page, USERS.teacher);
  const solutions = {
    python: 'from typing import List\nclass Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, n in enumerate(nums):\n            if target - n in seen:\n                return [seen[target - n], i]\n            seen[n] = i\n        return []\n',
    java: 'import java.util.HashMap;\nclass Solution { public int[] twoSum(int[] nums, int target) { HashMap<Integer,Integer> m = new HashMap<>(); for (int i = 0; i < nums.length; i++) { Integer j = m.get(target - nums[i]); if (j != null) return new int[]{j, i}; m.put(nums[i], i); } return new int[0]; } }',
  };
  for (const [language, source] of Object.entries(solutions)) {
    const { runId } = await api(page, 'post', '/code/submit', { questionId: ids.question, language, source });
    let run;
    await expect(async () => {
      run = await api(page, 'get', `/code/runs/${runId}`);
      expect(['done', 'error']).toContain(run.status);
    }).toPass({ timeout: 30_000 });
    expect(run.passedWeight, `${language}: ${JSON.stringify(run.results)}`).toBe(run.totalWeight);
    expect(run.totalWeight).toBe(3);
  }
});

test('the question exports and imports into another subject', async ({ page }) => {
  await signIn(page, USERS.teacher);
  const file = await api(page, 'get', `/questions/export?ids=${ids.question}`);
  expect(file.format).toBe('rvce-hub/questions@1');
  expect(file.questions[0].subject).toBeUndefined();
  expect(file.questions[0].code.drivers.python).toContain('@@USER_CODE@@');
  const res = await api(page, 'post', '/questions/bulk', { subject: ids.other, questions: file.questions });
  expect(res.imported).toBe(1);
  const copies = await api(page, 'get', `/questions?subject=${ids.other}&type=code`);
  expect(copies.some((x) => x.text.startsWith(TITLE) && x.code.mode === 'function')).toBe(true);
});

test('students see the signature, never the drivers', async ({ page }) => {
  await signIn(page, USERS.student);
  const view = await api(page, 'get', `/practice/questions/${ids.question}`);
  expect(view.code.mode).toBe('function');
  expect(JSON.stringify(view)).not.toContain('@@USER_CODE@@');
  expect(view.code.starter.python).toContain('def twoSum');
  await page.goto(`/practice/${ids.question}`);
  await expect(page.getByText('twoSum(nums: int[], target: int) → int[]')).toBeVisible();
  await page.getByLabel('Language').selectOption('python');
  // Keyboard: Ctrl+Enter in the editor runs the code.
  await page.locator('[data-code-editor] .cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByText(/^[01]\/1 test passed$/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Run finished/ })).toBeAttached();

  // The dividers are keyboard-resizable separators, and the editor is labelled.
  const divider = page.getByRole('separator', { name: 'Resize problem and editor' });
  const before = Number(await divider.getAttribute('aria-valuenow'));
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', String(before + 2));
  await page.keyboard.press('Enter');
  await expect(divider).toHaveAttribute('aria-valuenow', '40');
  await expect(page.getByRole('textbox', { name: /Python 3 code editor/ })).toBeVisible();
});
