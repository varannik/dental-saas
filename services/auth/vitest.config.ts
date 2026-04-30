import { defineConfig } from 'vitest/config';

/**
 * Ensure required vars exist before any module imports `@saas/config` (eager `env = getEnv()`).
 * Override with `.env` / `.env.test` when present (Vitest does not replace existing keys by default).
 */
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/dental_saas',
      JWT_SECRET: 'dev-only-jwt-secret-change-me-immediately',
      REDIS_URL: 'redis://127.0.0.1:6379',
    },
  },
});
