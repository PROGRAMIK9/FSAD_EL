import { test, expect } from '@playwright/test';

/**
 * Question-paper import, through all three ways a paper is read: a photo (OCR), a PDF with a
 * text layer (no OCR) and a scanned PDF (rendered, then OCR). The files are generated in the
 * browser from one paper, so the repository needs no binary fixtures.
 */
const TEACHER = 'e2e.teacher@rvce.edu.in';
const SUBJECT = 'MCA261IA';

const PAPER = `
  <body style="margin:48px;background:#fff;color:#000;font:28px/1.6 'DejaVu Serif',Georgia,serif">
    <p style="text-align:center;font-weight:bold">RV College of Engineering</p>
    <p>Time: 20 minutes &nbsp;&nbsp; Max Marks: 10</p>
    <p>1. Which data structure is first-in, first-out?</p>
    <p>(a) Stack</p><p>(b) Queue</p><p>(c) Tree</p><p>(d) Graph</p>
    <p>2. Which HTTP method is idempotent? [2]</p>
    <p>(a) POST &nbsp;&nbsp; (b) PUT</p>
    <p>3. The HTTP status code for Not Found is ________</p>
  </body>`;

/** @returns {Promise<{ photo: Buffer, textPdf: Buffer, scanPdf: Buffer }>} */
async function makePapers(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.setContent(PAPER);
  const photo = await page.screenshot({ fullPage: true });
  const textPdf = await page.pdf({ format: 'A4', printBackground: true });
  await page.setContent(
    `<body style="margin:0"><img style="width:100%" src="data:image/png;base64,${photo.toString('base64')}"></body>`,
  );
  const scanPdf = await page.pdf({ format: 'A4', printBackground: true });
  await page.close();
  return { photo, textPdf, scanPdf };
}

async function openImport(page, file) {
  await page.goto('/questions');
  await page.getByRole('button', { name: 'Import paper' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a question paper' });
  const subjects = (await (await page.request.get('/api/subjects')).json()).data;
  await dialog.getByLabel('Subject').selectOption(subjects.find((s) => s.code === SUBJECT)._id);
  await dialog.locator('input[type=file]').setInputFiles(file);
  await expect(dialog.getByRole('button', { name: /Import 3 questions/ })).toBeVisible({ timeout: 45_000 });
  return dialog;
}

const draft = (dialog, text) => dialog.getByRole('listitem').filter({ hasText: text });

test.describe.configure({ mode: 'serial' });
let papers;

test.beforeEach(async ({ page }) => {
  await page.context().clearCookies();
  const res = await page.request.post('/api/auth/dev-login', { data: { email: TEACHER } });
  expect(res.ok()).toBeTruthy();
  papers ??= await makePapers(page.context());
});

test('a photo is read with OCR, checked, and imported into the bank', async ({ page }) => {
  const blocked = [];
  page.on('console', (m) => /Content.Security.Policy|Refused to/i.test(m.text()) && blocked.push(m.text()));
  page.on('request', (r) => /jsdelivr|unpkg/.test(r.url()) && blocked.push(r.url()));

  const dialog = await openImport(page, {
    name: 'quiz-paper.png',
    mimeType: 'image/png',
    buffer: papers.photo,
  });
  await expect(dialog.getByText(/1 page, 1 read with OCR/)).toBeVisible();
  await expect(dialog.getByText('3 need an answer', { exact: true })).toBeVisible();
  await expect(draft(dialog, 'first-in, first-out')).toContainText('Queue');
  await expect(draft(dialog, 'idempotent')).toContainText('2 marks');

  const importButton = dialog.getByRole('button', { name: 'Import 3 questions' });
  await expect(importButton).toBeDisabled();
  await draft(dialog, 'first-in, first-out').getByRole('button', { name: 'B', exact: true }).click();
  await draft(dialog, 'idempotent').getByRole('button', { name: 'B', exact: true }).click();
  await draft(dialog, 'Not Found').getByLabel('Accepted answer').fill('404');
  await expect(dialog.getByText('3 ready', { exact: true })).toBeVisible();
  await importButton.click();
  await expect(page.getByText(`3 questions added to ${SUBJECT}`)).toBeVisible();

  const res = await page.request.get('/api/questions?search=idempotent');
  const imported = (await res.json()).data;
  expect(imported).toHaveLength(1);
  expect(imported[0]).toMatchObject({
    type: 'single',
    marks: 2,
    correctAnswer: 'B',
    options: [
      { key: 'A', text: 'POST' },
      { key: 'B', text: 'PUT' },
    ],
  });
  expect(blocked).toEqual([]);
});

test('a PDF with a text layer is read without OCR', async ({ page }) => {
  const dialog = await openImport(page, {
    name: 'quiz-paper.pdf',
    mimeType: 'application/pdf',
    buffer: papers.textPdf,
  });
  await expect(dialog.getByText(/1 page, text layer/)).toBeVisible();
  await expect(draft(dialog, 'first-in, first-out')).toContainText('Graph');
  // The blank wraps onto its own line in the PDF and must stay with question 3.
  await expect(draft(dialog, 'Not Found')).toContainText('Fill in');
  await expect(draft(dialog, 'Not Found')).not.toContainText('long-answer');
});

test('a scanned PDF is rendered and read with OCR', async ({ page }) => {
  const dialog = await openImport(page, {
    name: 'scanned-paper.pdf',
    mimeType: 'application/pdf',
    buffer: papers.scanPdf,
  });
  await expect(dialog.getByText(/1 page, 1 read with OCR/)).toBeVisible();
  await expect(draft(dialog, 'Not Found')).toBeVisible();
});
