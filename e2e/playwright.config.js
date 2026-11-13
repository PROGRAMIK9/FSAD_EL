import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT || '4300';
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'node e2e/start-server.js',
    cwd: '..',
    url: `http://localhost:${port}/api/health`,
    timeout: 180_000,
    reuseExistingServer: process.env.E2E_REUSE === 'true',
    stdout: 'pipe',
  },
});
