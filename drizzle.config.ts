import { defineConfig } from 'drizzle-kit';

import { existsSync } from 'node:fs';

for (const envFile of ['.env.local', '.env']) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for Drizzle Kit. Set it in your shell or create .env/.env.local (for example from .env.example).'
  );
}

export default defineConfig({
  out: './drizzle',
  schema: './packages/config/src/schema/**/*.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
