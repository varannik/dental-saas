import { ROLE_PERMISSIONS, type SystemRole } from '@dental/contracts';
import { migrate, uuidv7 } from '@dental/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { createPool, type Pool } from '../platform/db.js';
import type { TokenService } from '../modules/identity/tokens.js';

/**
 * A migrated PostgreSQL in a container for integration tests. `owner` bypasses row-level
 * security for setup and inspection; `pool` connects as the application role, like the API.
 */
export interface TestDatabase {
  owner: pg.Client;
  ownerUrl: string;
  pool: Pool;
  close(): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'pgvector/pgvector:pg16'
  )
    .withDatabase('dental')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();
  const ownerUrl = container.getConnectionUri();
  await migrate(ownerUrl);
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  const appUrl = new URL(ownerUrl);
  appUrl.username = 'app';
  appUrl.password = 'app';
  const pool = createPool(appUrl.toString());
  return {
    owner,
    ownerUrl,
    pool,
    async close() {
      await pool.end();
      await owner.end();
      await container.stop();
    },
  };
}

export async function createClinic(owner: pg.Client, name: string): Promise<string> {
  const profile = await owner.query<{ id: string }>(
    `INSERT INTO core.regulatory_profiles (id, key, name, record_retention_days, audit_retention_days)
     VALUES ($1, 'test', 'Test', 3650, 3650)
     ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
     RETURNING id`,
    [uuidv7()]
  );
  const id = uuidv7();
  await owner.query(
    `INSERT INTO core.clinics (id, name, country, regulatory_profile_id, currency, timezone)
     VALUES ($1, $2, 'GB', $3, 'GBP', 'Europe/London')`,
    [id, name, profile.rows[0]!.id]
  );
  return id;
}

/** A member of the clinic. The password hash is a placeholder: these users sign in by token. */
export async function createMember(
  owner: pg.Client,
  clinicId: string,
  role: SystemRole
): Promise<string> {
  const id = uuidv7();
  await owner.query(`INSERT INTO core.users (id, email, password_hash) VALUES ($1, $2, 'x')`, [
    id,
    `${role}-${id}@test.local`,
  ]);
  await owner.query(
    `INSERT INTO core.memberships (id, user_id, clinic_id, role_id)
     SELECT $1, $2, $3, id FROM core.roles WHERE key = $4 AND clinic_id IS NULL`,
    [uuidv7(), id, clinicId, role]
  );
  return id;
}

/** An access token as sign-in would issue it, with the role's permissions from the contracts. */
export function accessToken(
  tokens: TokenService,
  member: { userId: string; clinicId: string; role: SystemRole }
): Promise<string> {
  return tokens.signAccess({
    userId: member.userId,
    clinicId: member.clinicId,
    sessionId: uuidv7(),
    role: member.role,
    permissions: [...ROLE_PERMISSIONS[member.role]],
  });
}
