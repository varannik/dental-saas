import { defineConfig } from 'vitest/config';

const isCi = Boolean(process.env.CI);

/**
 * Vitest output & env defaults for `@saas/users`.
 *
 * - Local: `default` reporter (nested describe blocks read as a tree).
 * - CI: `default` + `github-actions` for job annotations; full error strings (no aggressive truncation).
 *
 * Matches auth’s injected `test.env` so `@saas/config` resolves before any eager `getEnv()` import.
 */
export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: false,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    slowTestThreshold: 500,
    outputTruncateLength: 20_000,
    // Local: built-in "default" reporter = nested describe/it tree; CI: annotations.
    reporters: isCi ? ['default', 'github-actions'] : 'default',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/dental_saas',
      JWT_SECRET: 'dev-only-jwt-secret-change-me-immediately',
      REDIS_URL: 'redis://127.0.0.1:6379',
    },
  },
});
