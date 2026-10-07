import '../platform/env.js';
import { uuidv7 } from '@dental/db';
import pg from 'pg';
import { hashPassword } from '../modules/identity/passwords.js';

/**
 * A fresh clinic with one dentist for an end-to-end run, so runs never share data:
 * pnpm --filter @dental/api e2e:seed. Runs as the database owner and refuses production.
 * Prints the dentist's credentials as JSON on the last line.
 */

const PASSWORD = 'e2e-dental-password';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production.');
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('Set DATABASE_MIGRATION_URL to the database owner connection.');

  const stamp = Date.now().toString(36);
  const clinicName = `E2E Dental ${stamp}`;
  const email = `dentist-${stamp}@e2e.test`;
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
    const clinicId = uuidv7();
    await client.query(
      `INSERT INTO core.clinics (id, name, country, regulatory_profile_id, currency, timezone)
       VALUES ($1, $2, 'GB', $3, 'GBP', 'Europe/London')`,
      [clinicId, clinicName, profile.rows[0]!.id]
    );
    const userId = uuidv7();
    await client.query(`INSERT INTO core.users (id, email, password_hash) VALUES ($1, $2, $3)`, [
      userId,
      email,
      await hashPassword(PASSWORD),
    ]);
    await client.query(
      `INSERT INTO core.memberships (id, user_id, clinic_id, role_id)
       SELECT $1, $2, $3, id FROM core.roles WHERE key = 'dentist' AND clinic_id IS NULL`,
      [uuidv7(), userId, clinicId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({ clinicName, email, password: PASSWORD }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
