import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/dental_saas',
      JWT_SECRET: 'dev-only-jwt-secret-change-me-immediately',
    },
  },
});
