import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrate } from './migrate.js';
import { uuidv7 } from './uuid.js';

const { Client } = pg;

describe('clinic isolation', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('dental')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();
    await migrate(container.getConnectionUri());
  }, 180_000);

  afterAll(async () => {
    await container.stop();
  });

  it('reads zero rows of the other clinic on every clinic-owned table', async () => {
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();

    const profileId = uuidv7();
    const clinicA = uuidv7();
    const clinicB = uuidv7();
    const userA = uuidv7();
    const userB = uuidv7();
    const roleA = uuidv7();
    const roleB = uuidv7();
    const systemRole = uuidv7();
    const permissionId = uuidv7();

    await admin.query(
      `INSERT INTO core.regulatory_profiles (id, key, name, record_retention_days, audit_retention_days)
       VALUES ($1, 'test', 'Test profile', 3650, 3650)`,
      [profileId]
    );
    await admin.query(
      `INSERT INTO core.clinics (id, name, country, regulatory_profile_id, currency, timezone)
       VALUES ($1, 'Clinic A', 'GB', $3, 'GBP', 'Europe/London'),
              ($2, 'Clinic B', 'IR', $3, 'IRR', 'Asia/Tehran')`,
      [clinicA, clinicB, profileId]
    );
    await admin.query(
      `INSERT INTO core.users (id, email, password_hash)
       VALUES ($1, 'a@example.com', 'hash'), ($2, 'b@example.com', 'hash')`,
      [userA, userB]
    );
    await admin.query(
      `INSERT INTO core.roles (id, clinic_id, key) VALUES
         ($1, $2, 'dentist'),
         ($3, $4, 'dentist'),
         ($5, NULL, 'platform')`,
      [roleA, clinicA, roleB, clinicB, systemRole]
    );
    await admin.query(`INSERT INTO core.permissions (id, key) VALUES ($1, 'patient.read')`, [
      permissionId,
    ]);
    await admin.query(
      `INSERT INTO core.role_permissions (role_id, permission_id) VALUES ($1, $3), ($2, $3)`,
      [roleA, roleB, permissionId]
    );
    await admin.query(
      `INSERT INTO core.memberships (id, user_id, clinic_id, role_id) VALUES
         ($1, $2, $3, $4),
         ($5, $6, $7, $8)`,
      [uuidv7(), userA, clinicA, roleA, uuidv7(), userB, clinicB, roleB]
    );
    await admin.end();

    const app = new Client({
      host: container.getHost(),
      port: container.getMappedPort(5432),
      user: 'app',
      password: 'app',
      database: 'dental',
    });
    await app.connect();
    try {
      await app.query('BEGIN');
      const unset = await app.query('SELECT id FROM core.clinics');
      expect(unset.rows).toEqual([]);
      await app.query('ROLLBACK');

      for (const [viewer, hidden, hiddenRole] of [
        [clinicB, clinicA, roleA],
        [clinicA, clinicB, roleB],
      ] as const) {
        await app.query('BEGIN');
        await app.query(`SELECT set_config('app.clinic_id', $1, true)`, [viewer]);

        const visibleClinics = await app.query<{ id: string }>('SELECT id FROM core.clinics');
        expect(visibleClinics.rows.map((row) => row.id)).toEqual([viewer]);

        const memberships = await app.query<{ clinic_id: string }>(
          'SELECT clinic_id FROM core.memberships'
        );
        expect(memberships.rows.map((row) => row.clinic_id)).toEqual([viewer]);

        const roles = await app.query<{ id: string; clinic_id: string | null }>(
          'SELECT id, clinic_id FROM core.roles'
        );
        expect(roles.rows.some((row) => row.clinic_id === hidden)).toBe(false);
        expect(roles.rows.some((row) => row.id === systemRole)).toBe(true);

        const leaked = await app.query(
          'SELECT role_id FROM core.role_permissions WHERE role_id = $1',
          [hiddenRole]
        );
        expect(leaked.rows).toEqual([]);

        await app.query('ROLLBACK');
      }
    } finally {
      await app.end();
    }
  });
});
