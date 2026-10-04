import '../platform/env.js';
import { uuidv7 } from '@dental/db';
import type { SystemRole } from '@dental/contracts';
import pg from 'pg';
import { hashPassword } from '../modules/identity/passwords.js';

/**
 * Seeds a development clinic and one user per role: pnpm --filter @dental/api db:seed
 * Runs as the database owner (DATABASE_MIGRATION_URL) and refuses to run in production.
 * Safe to run again: existing rows are left alone.
 */

export const DEV_PASSWORD = 'dental-dev-password';

const USERS: { email: string; role: SystemRole }[] = [
  { email: 'dentist@demo.test', role: 'dentist' },
  { email: 'assistant@demo.test', role: 'assistant' },
  { email: 'reception@demo.test', role: 'receptionist' },
  { email: 'manager@demo.test', role: 'manager' },
  { email: 'admin@demo.test', role: 'admin' },
];

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production.');
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('Set DATABASE_MIGRATION_URL to the database owner connection.');

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const profile = await client.query<{ id: string }>(
      `INSERT INTO core.regulatory_profiles
         (id, key, name, record_retention_days, audit_retention_days, external_processing_allowed, external_ai_allowed)
       VALUES ($1, 'development', 'Development (no real patients)', 3650, 3650, true, true)
       ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
       RETURNING id`,
      [uuidv7()]
    );
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM core.clinics WHERE name = 'Demo Dental'`
    );
    const clinicId = existing.rows[0]?.id ?? uuidv7();
    if (!existing.rows[0]) {
      await client.query(
        `INSERT INTO core.clinics (id, name, country, regulatory_profile_id, currency, timezone)
         VALUES ($1, 'Demo Dental', 'GB', $2, 'GBP', 'Europe/London')`,
        [clinicId, profile.rows[0]!.id]
      );
    }

    const passwordHash = await hashPassword(DEV_PASSWORD);
    for (const { email, role } of USERS) {
      const user = await client.query<{ id: string }>(
        `INSERT INTO core.users (id, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [uuidv7(), email, passwordHash]
      );
      await client.query(
        `INSERT INTO core.memberships (id, user_id, clinic_id, role_id)
         SELECT $1, $2, $3, id FROM core.roles WHERE key = $4 AND clinic_id IS NULL
         ON CONFLICT (user_id, clinic_id) DO NOTHING`,
        [uuidv7(), user.rows[0]!.id, clinicId, role]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  console.log(`Seeded clinic "Demo Dental" with users (password: ${DEV_PASSWORD}):`);
  for (const { email, role } of USERS) console.log(`  ${email.padEnd(22)} ${role}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
