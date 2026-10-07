import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the local stack: pnpm e2e. The database must be up and migrated;
 * the API and the web app are started unless they already run on 4000 and 3000. Each run seeds
 * its own clinic and dentist, so runs never share data.
 */

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1280, height: 1000 },
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  webServer: [
    {
      command: 'pnpm --filter @dental/api dev',
      url: 'http://localhost:4000/v1/me',
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @dental/web dev',
      url: 'http://localhost:3000/sign-in',
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
