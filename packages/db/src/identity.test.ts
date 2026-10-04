import { PERMISSIONS, ROLE_PERMISSIONS } from '@dental/contracts';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrate.js';
import { uuidv7 } from './uuid.js';

const { Client } = pg;

describe('identity migration', () => {
  let container: StartedPostgreSqlContainer;
  let admin: pg.Client;
  let app: pg.Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('dental')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();
    await migrate(container.getConnectionUri());
    admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    app = new Client({
      host: container.getHost(),
      port: container.getMappedPort(5432),
      user: 'app',
      password: 'app',
      database: 'dental',
    });
    await app.connect();
  }, 180_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
    await container?.stop();
  });

  it('seeds every permission key from the contracts', async () => {
    const { rows } = await admin.query<{ key: string }>('SELECT key FROM core.permissions');
    expect(rows.map((row) => row.key).sort()).toEqual([...PERMISSIONS].sort());
  });

  it('seeds the system roles with the permissions in the contracts', async () => {
    const { rows } = await admin.query<{ role: string; permission: string }>(
      `SELECT r.key AS role, p.key AS permission
       FROM core.roles r
       JOIN core.role_permissions rp ON rp.role_id = r.id
       JOIN core.permissions p ON p.id = rp.permission_id
       WHERE r.clinic_id IS NULL`
    );
    const seeded: Record<string, string[]> = {};
    for (const row of rows) (seeded[row.role] ??= []).push(row.permission);
    const expected = Object.fromEntries(
      Object.entries(ROLE_PERMISSIONS).map(([role, keys]) => [role, [...keys].sort()])
    );
    expect(
      Object.fromEntries(Object.entries(seeded).map(([role, keys]) => [role, keys.sort()]))
    ).toEqual(expected);
  });

  it('hides users from the application role', async () => {
    await expect(app.query('SELECT email FROM core.users')).rejects.toThrow(/permission denied/);
  });

  it('signs in through the definer functions only', async () => {
    const profile = uuidv7();
    const clinicA = uuidv7();
    const clinicB = uuidv7();
    const user = uuidv7();
    await admin.query(
      `INSERT INTO core.regulatory_profiles (id, key, name, record_retention_days, audit_retention_days)
       VALUES ($1, 'identity-test', 'Test', 3650, 3650)`,
      [profile]
    );
    await admin.query(
      `INSERT INTO core.clinics (id, name, country, regulatory_profile_id, currency, timezone)
       VALUES ($1, 'Alpha Dental', 'GB', $3, 'GBP', 'Europe/London'),
              ($2, 'Beta Dental', 'GB', $3, 'GBP', 'Europe/London')`,
      [clinicA, clinicB, profile]
    );
    await admin.query(
      `INSERT INTO core.users (id, email, password_hash) VALUES ($1, 'Dentist@Example.com', 'h')`,
      [user]
    );
    await admin.query(
      `INSERT INTO core.memberships (id, user_id, clinic_id, role_id)
       SELECT $1::uuid, $2::uuid, $3::uuid, id FROM core.roles
       WHERE key = 'dentist' AND clinic_id IS NULL
       UNION ALL
       SELECT $4::uuid, $2::uuid, $5::uuid, id FROM core.roles
       WHERE key = 'receptionist' AND clinic_id IS NULL`,
      [uuidv7(), user, clinicA, uuidv7(), clinicB]
    );

    const found = await app.query('SELECT * FROM core.auth_find_user($1)', ['dentist@example.com']);
    expect(found.rows).toHaveLength(1);
    expect(found.rows[0]).toMatchObject({ id: user, status: 'active', failed_login_count: 0 });

    // Memberships across clinics are visible to sign-in, not to ordinary queries.
    const memberships = await app.query('SELECT * FROM core.auth_memberships($1)', [user]);
    expect(memberships.rows).toEqual([
      { clinic_id: clinicA, clinic_name: 'Alpha Dental', role_key: 'dentist' },
      { clinic_id: clinicB, clinic_name: 'Beta Dental', role_key: 'receptionist' },
    ]);
    const direct = await app.query('SELECT * FROM core.memberships');
    expect(direct.rows).toEqual([]);

    const permissions = await app.query<{ auth_permissions: string }>(
      'SELECT * FROM core.auth_permissions($1, $2)',
      [user, clinicB]
    );
    expect(permissions.rows.map((row) => row.auth_permissions)).toEqual([
      'patient.read',
      'patient.write',
    ]);
  });

  it('locks an account after repeated failures, with growing back-off', async () => {
    const user = uuidv7();
    await admin.query(
      `INSERT INTO core.users (id, email, password_hash) VALUES ($1, 'lock@example.com', 'h')`,
      [user]
    );
    const fail = async () =>
      (
        await app.query<{ locked_until: Date | null }>(
          'SELECT core.auth_record_failure($1, 3, 60) AS locked_until',
          [user]
        )
      ).rows[0]!.locked_until;

    expect(await fail()).toBeNull();
    expect(await fail()).toBeNull();
    const first = await fail();
    const second = await fail();
    expect(first).toBeInstanceOf(Date);
    // 60 s at the threshold, 120 s one failure later.
    const now = Date.now();
    expect(first!.getTime() - now).toBeGreaterThan(50_000);
    expect(first!.getTime() - now).toBeLessThan(70_000);
    expect(second!.getTime() - now).toBeGreaterThan(110_000);

    await app.query('SELECT core.auth_record_success($1)', [user]);
    const reset = await app.query('SELECT * FROM core.auth_find_user($1)', ['lock@example.com']);
    expect(reset.rows[0]).toMatchObject({ failed_login_count: 0, locked_until: null });
  });
});
