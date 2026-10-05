import pg from 'pg';

/**
 * PostgreSQL access for the API. The API connects as the application role, which cannot
 * bypass row-level security; every clinic-owned query runs inside withClinic.
 */

// Dates (OID 1082) stay as YYYY-MM-DD strings. The default turns them into Date objects at
// local midnight, which can shift a date of birth by a day.
pg.types.setTypeParser(1082, (value: string) => value);

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function createPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

/** Refuses a connection that would bypass row-level security, such as a superuser. */
export async function assertRowLevelSecurityEnforced(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
  );
  const role = rows[0];
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `DATABASE_URL connects as "${role?.rolname ?? 'unknown'}", which bypasses row-level ` +
        'security. Use the application role (app); migrations use DATABASE_MIGRATION_URL.'
    );
  }
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Runs work in a transaction scoped to one clinic; row-level security applies to every query. */
export async function withClinic<T>(
  pool: Pool,
  clinicId: string,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withTransaction(pool, async (client) => {
    await client.query(`SELECT set_config('app.clinic_id', $1, true)`, [clinicId]);
    return work(client);
  });
}
