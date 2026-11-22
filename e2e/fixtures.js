/**
 * Shared Playwright `test` that records what the browser saw: uncaught page errors, console
 * errors and failed API requests. When a test fails they are printed (so CI logs explain the
 * failure without downloading the report) and attached to the HTML report.
 */
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const events = [];
    const at = () => new Date().toISOString().slice(11, 23);
    page.on('pageerror', (e) => events.push(`${at()} pageerror  ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') events.push(`${at()} console    ${m.text().slice(0, 500)}`);
    });
    page.on('requestfailed', (r) => events.push(`${at()} failed     ${r.method()} ${r.url()} (${r.failure()?.errorText})`));
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 400) events.push(`${at()} http ${r.status()}   ${r.request().method()} ${r.url()}`);
    });
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && events.length) {
      const text = events.join('\n');
      console.log(`\n── Browser events for "${testInfo.title}" ──\n${text}\n`);
      await testInfo.attach('browser-events.txt', { body: text, contentType: 'text/plain' });
    }
  },
});

export { expect };

/** Opens the question bank and waits until it has loaded (subjects included). */
export async function openQuestionBank(page) {
  await page.goto('/questions');
  await expect(page.getByRole('heading', { name: /Question\s+bank/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Create program' }).first()).toBeEnabled({ timeout: 15_000 });
}
