import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { Redis } from 'ioredis';
import { Client } from 'pg';

const DEFAULT_API_URL = 'http://localhost:4001';
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/dental_saas';
const DEFAULT_REDIS_URL = 'redis://localhost:6379';
const TEST_EMAIL_PREFIX = 'itest-';

export const DEMO_TENANT_ID = process.env.TEST_TENANT_ID ?? '11111111-1111-4111-8111-111111111111';
export const DEFAULT_PASSWORD = 'ValidPassword123!';

export interface TestResponse {
  status: number;
  data: unknown;
}

/** Use in integration tests so failures include the JSON body (e.g. Drizzle `Failed query`, Zod details). */
export function assertHttpStatus(
  response: TestResponse,
  expectedStatus: number,
  context: string
): void {
  if (response.status === expectedStatus) return;
  const body =
    typeof response.data === 'object' && response.data !== null
      ? JSON.stringify(response.data, null, 2)
      : String(response.data);
  throw new Error(
    `${context}: expected HTTP ${expectedStatus}, got ${response.status}.\nResponse body:\n${body}`
  );
}

/** HTTP client — use when targeting a real listening server (e.g. manual debugging on TEST_API_URL). */
export class AuthTestClient {
  private authToken: string | null = null;
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.TEST_API_URL ?? DEFAULT_API_URL) {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  async get(path: string): Promise<TestResponse> {
    return this.request('GET', path);
  }

  async post(path: string, body?: unknown): Promise<TestResponse> {
    return this.request('POST', path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<TestResponse> {
    const headers: Record<string, string> = {
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }
}

/**
 * In-process auth app — same DATABASE_URL / REDIS_URL as the vitest worker (avoids mismatch with a separate server on :4001).
 */
export class AuthInjectClient {
  private authToken: string | null = null;

  constructor(private readonly app: FastifyInstance) {}

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  async get(path: string): Promise<TestResponse> {
    return injectAuthRequest(this.app, 'GET', path, { authToken: this.authToken });
  }

  async post(path: string, body?: unknown): Promise<TestResponse> {
    return injectAuthRequest(this.app, 'POST', path, {
      body,
      authToken: this.authToken,
    });
  }
}

async function injectAuthRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; authToken?: string | null }
): Promise<TestResponse> {
  const headers: Record<string, string> = {};
  if (options.authToken) {
    headers.authorization = `Bearer ${options.authToken}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const injectOpts: InjectOptions = {
    method,
    url: path,
    headers,
  };
  if (options.body !== undefined) {
    injectOpts.payload =
      typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const res = await app.inject(injectOpts);

  let data: unknown = {};
  if (res.body && res.body.length > 0) {
    try {
      data = JSON.parse(res.body) as unknown;
    } catch {
      data = { _raw: res.body };
    }
  }
  return { status: res.statusCode, data };
}

function getDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_DB_URL;
}

function getRedisUrl(): string {
  return process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

async function withClient<T>(runner: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  try {
    return await runner(client);
  } finally {
    await client.end();
  }
}

function createRedisClient(): Redis {
  return new Redis(getRedisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

/** Fails fast when the DB used for integration helpers is missing core auth tables. */
export async function assertIntegrationDatabaseReady(): Promise<void> {
  await withClient(async (client) => {
    const result = await client.query<{ exists: boolean }>(
      `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'users'
      ) as exists
      `
    );
    const exists = result.rows[0]?.exists === true;
    if (!exists) {
      throw new Error(
        'Integration DB check failed: public.users is missing. Run migrations against this database (e.g. from repo root: `DATABASE_URL=... pnpm exec drizzle-kit migrate`). Use the same DATABASE_URL as the auth service (set TEST_DATABASE_URL for the test process if it differs from DATABASE_URL).'
      );
    }
  });
}

export async function setupIntegrationData(): Promise<void> {
  try {
    await withClient(async (client) => {
      await client.query(
        `
        insert into tenants (id, name, type)
        values ($1, $2, $3)
        on conflict (id) do update
          set name = excluded.name,
              type = excluded.type
        `,
        [DEMO_TENANT_ID, 'Demo Dental Practice', 'SOLO_PRACTICE']
      );
    });
  } catch (error) {
    // Keep integration tests runnable even when direct DB access differs from service runtime.
    console.warn(
      '[integration setup] Skipping direct DB seed; relying on existing tenant data.',
      error
    );
  }
}

export async function clearIntegrationData(): Promise<void> {
  try {
    await withClient(async (client) => {
      const usersResult = await client.query<{ id: string }>(
        `
        select id
        from users
        where email like $1
        `,
        [`${TEST_EMAIL_PREFIX}%`]
      );

      const userIds = usersResult.rows.map((row: { id: string }) => row.id);
      if (userIds.length > 0) {
        await client.query('delete from sessions where user_id = any($1::uuid[])', [userIds]);
        await client.query('delete from user_auth_identities where user_id = any($1::uuid[])', [
          userIds,
        ]);
        await client.query('delete from user_tenants where user_id = any($1::uuid[])', [userIds]);
        await client.query('delete from users where id = any($1::uuid[])', [userIds]);
      }
    });
  } catch (error) {
    console.warn('[integration cleanup] Skipping direct DB cleanup.', error);
  }

  const redis = createRedisClient();
  try {
    try {
      const keys = await redis.keys('dental:session:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.warn('[integration cleanup] Skipping Redis cleanup.', error);
    }
  } finally {
    redis.disconnect();
  }
}

export function createTestEmail(): string {
  return `${TEST_EMAIL_PREFIX}${randomUUID()}@example.local`;
}
