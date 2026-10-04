import { migrate, uuidv7 } from '@dental/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertRowLevelSecurityEnforced, createPool, type Pool } from '../../platform/db.js';
import { buildServer } from '../../server.js';
import { createDummyHash, hashPassword } from './passwords.js';
import { CSRF_HEADER, REFRESH_COOKIE } from './routes.js';
import { IdentityService } from './service.js';
import { loadSigningKeys, TokenService } from './tokens.js';

/** F5 against a real PostgreSQL: the API connects as the application role, as in production. */

const PASSWORD = 'correct horse battery staple';

let container: StartedPostgreSqlContainer;
let owner: pg.Client;
let pool: Pool;
let app: FastifyInstance;
const ids = {
  alpha: uuidv7(),
  beta: uuidv7(),
  dentist: uuidv7(),
  multi: uuidv7(),
  locked: uuidv7(),
  retired: uuidv7(),
};

async function addUser(id: string, email: string, status = 'active') {
  await owner.query(
    `INSERT INTO core.users (id, email, password_hash, status) VALUES ($1, $2, $3, $4)`,
    [id, email, await hashPassword(PASSWORD), status]
  );
}

async function addMembership(user: string, clinic: string, role: string) {
  await owner.query(
    `INSERT INTO core.memberships (id, user_id, clinic_id, role_id)
     SELECT $1, $2, $3, id FROM core.roles WHERE key = $4 AND clinic_id IS NULL`,
    [uuidv7(), user, clinic, role]
  );
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('dental')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();
  await migrate(container.getConnectionUri());
  owner = new pg.Client({ connectionString: container.getConnectionUri() });
  await owner.connect();

  const profile = uuidv7();
  await owner.query(
    `INSERT INTO core.regulatory_profiles (id, key, name, record_retention_days, audit_retention_days)
     VALUES ($1, 'test', 'Test', 3650, 3650)`,
    [profile]
  );
  await owner.query(
    `INSERT INTO core.clinics (id, name, country, regulatory_profile_id, currency, timezone)
     VALUES ($1, 'Alpha Dental', 'GB', $3, 'GBP', 'Europe/London'),
            ($2, 'Beta Dental', 'IR', $3, 'IRR', 'Asia/Tehran')`,
    [ids.alpha, ids.beta, profile]
  );
  await addUser(ids.dentist, 'dentist@alpha.test');
  await addMembership(ids.dentist, ids.alpha, 'dentist');
  await addUser(ids.multi, 'multi@clinics.test');
  await addMembership(ids.multi, ids.alpha, 'manager');
  await addMembership(ids.multi, ids.beta, 'receptionist');
  await addUser(ids.locked, 'locked@alpha.test');
  await addMembership(ids.locked, ids.alpha, 'assistant');
  await addUser(ids.retired, 'retired@alpha.test', 'deactivated');
  await addMembership(ids.retired, ids.alpha, 'dentist');

  const url = new URL(container.getConnectionUri());
  url.username = 'app';
  url.password = 'app';
  pool = createPool(url.toString());
  const tokens = new TokenService(loadSigningKeys(), 600);
  app = await buildServer({
    identity: {
      pool,
      tokens,
      service: new IdentityService(pool, tokens, await createDummyHash(), {
        lockThreshold: 3,
        lockBaseSeconds: 60,
        refreshTtlDays: 7,
      }),
      cookie: { secure: false, sameSite: 'lax' },
      // Many sign-ins come from one address in this suite; the limit has its own test.
      loginRateLimit: 1000,
    },
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await owner?.end();
  await container?.stop();
});

beforeEach(async () => {
  // Each test starts with no failed sign-ins, except for the account the lockout test uses.
  await owner.query(
    `UPDATE core.users SET failed_login_count = 0, locked_until = NULL WHERE id <> $1`,
    [ids.locked]
  );
});

const login = (body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/v1/auth/login', payload: body });

const refreshCookie = (response: { cookies: { name: string; value: string }[] }) =>
  response.cookies.find((cookie) => cookie.name === REFRESH_COOKIE)?.value;

const refresh = (token: string) =>
  app.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    cookies: { [REFRESH_COOKIE]: token },
    headers: { [CSRF_HEADER]: 'fetch' },
  });

describe('database connection', () => {
  it('accepts the application role and refuses a superuser', async () => {
    await expect(assertRowLevelSecurityEnforced(pool)).resolves.toBeUndefined();
    const superuser = createPool(container.getConnectionUri());
    await expect(assertRowLevelSecurityEnforced(superuser)).rejects.toThrow(/bypasses row-level/);
    await superuser.end();
  });

  it('reports readiness from the database', async () => {
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('sign-in', () => {
  it('returns an access token, permissions and an httpOnly refresh cookie', async () => {
    const response = await login({ email: 'Dentist@Alpha.test', password: PASSWORD });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 600,
      user: { id: ids.dentist, email: 'dentist@alpha.test' },
      clinic: { id: ids.alpha, name: 'Alpha Dental' },
      role: 'dentist',
    });
    expect(body.permissions).toContain('session.sign');
    expect(body).not.toHaveProperty('refreshToken');

    const cookie = response.cookies.find((entry) => entry.name === REFRESH_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, path: '/v1/auth', sameSite: 'Lax' });
    expect(cookie?.value.length).toBeGreaterThan(30);
  });

  it('serves /v1/me with the clinic read under row-level security', async () => {
    const { accessToken } = (
      await login({ email: 'dentist@alpha.test', password: PASSWORD })
    ).json();
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { id: ids.dentist },
      clinic: { id: ids.alpha, currency: 'GBP', toothNotation: 'FDI' },
      role: 'dentist',
    });
  });

  it('refuses /v1/me without a valid token', async () => {
    const missing = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({ code: 'unauthenticated' });
    const forged = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer abc.def.ghi' },
    });
    expect(forged.statusCode).toBe(401);
  });

  it('gives the same answer for an unknown email, a wrong password and a deactivated account', async () => {
    const unknown = await login({ email: 'nobody@alpha.test', password: PASSWORD });
    const wrong = await login({ email: 'dentist@alpha.test', password: 'nope' });
    const retired = await login({ email: 'retired@alpha.test', password: PASSWORD });
    for (const response of [unknown, wrong, retired]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'invalid_credentials' });
    }
  });

  it('rejects a malformed body', async () => {
    const response = await login({ email: 'not-an-email' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });

  it('asks a member of several clinics to choose, then signs in to the chosen one', async () => {
    const ask = await login({ email: 'multi@clinics.test', password: PASSWORD });
    expect(ask.statusCode).toBe(422);
    expect(ask.json()).toMatchObject({
      code: 'clinic_required',
      clinics: [
        { id: ids.alpha, name: 'Alpha Dental', role: 'manager' },
        { id: ids.beta, name: 'Beta Dental', role: 'receptionist' },
      ],
    });

    const beta = await login({
      email: 'multi@clinics.test',
      password: PASSWORD,
      clinicId: ids.beta,
    });
    expect(beta.statusCode).toBe(200);
    expect(beta.json()).toMatchObject({ clinic: { id: ids.beta }, role: 'receptionist' });
    expect(beta.json().permissions).toEqual(['patient.read', 'patient.write']);

    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${beta.json().accessToken}` },
    });
    expect(me.json().clinic).toMatchObject({ id: ids.beta, currency: 'IRR' });
  });

  it('refuses a clinic the user does not belong to', async () => {
    const response = await login({
      email: 'dentist@alpha.test',
      password: PASSWORD,
      clinicId: ids.beta,
    });
    expect(response.statusCode).toBe(403);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await login({ email: 'locked@alpha.test', password: 'bad' })).statusCode).toBe(401);
    }
    const third = await login({ email: 'locked@alpha.test', password: 'bad' });
    expect(third.statusCode).toBe(423);
    expect(third.json()).toMatchObject({ code: 'account_locked' });
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);

    const right = await login({ email: 'locked@alpha.test', password: PASSWORD });
    expect(right.statusCode).toBe(423);
  });
});

describe('rate limit', () => {
  it('limits sign-in attempts per address', async () => {
    const tokens = new TokenService(loadSigningKeys(), 600);
    const limited = await buildServer({
      identity: {
        pool,
        tokens,
        service: new IdentityService(pool, tokens, await createDummyHash()),
        cookie: { secure: false, sameSite: 'lax' },
        loginRateLimit: 2,
      },
    });
    const attempt = () =>
      limited.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'nobody@alpha.test', password: 'x' },
      });
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
    await limited.close();
  });
});

describe('refresh-token rotation', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const first = refreshCookie(await login({ email: 'dentist@alpha.test', password: PASSWORD }))!;
    const rotated = await refresh(first);
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json()).toMatchObject({ clinic: { id: ids.alpha }, role: 'dentist' });
    const second = refreshCookie(rotated)!;
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect((await refresh(second)).statusCode).toBe(200);
  });

  it('revokes the whole family when a used refresh token comes back', async () => {
    const first = refreshCookie(await login({ email: 'dentist@alpha.test', password: PASSWORD }))!;
    const second = refreshCookie(await refresh(first))!;

    // Someone replays the first token after it was rotated.
    const reuse = await refresh(first);
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toMatchObject({ code: 'refresh_token_reused' });

    // The legitimate client's current token is revoked with the family.
    const after = await refresh(second);
    expect(after.statusCode).toBe(401);

    const { rows } = await owner.query(
      `SELECT count(*)::int AS open FROM core.auth_sessions
       WHERE family_id = (SELECT family_id FROM core.auth_sessions WHERE user_id = $1
                          ORDER BY created_at DESC LIMIT 1)
         AND revoked_at IS NULL`,
      [ids.dentist]
    );
    expect(rows[0].open).toBe(0);
  });

  it('requires the CSRF header and a cookie', async () => {
    const token = refreshCookie(await login({ email: 'dentist@alpha.test', password: PASSWORD }))!;
    const noHeader = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { [REFRESH_COOKIE]: token },
    });
    expect(noHeader.statusCode).toBe(403);
    const noCookie = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { [CSRF_HEADER]: 'fetch' },
    });
    expect(noCookie.statusCode).toBe(401);
  });

  it('ends the session when the membership is removed', async () => {
    const user = uuidv7();
    await addUser(user, 'leaver@alpha.test');
    await addMembership(user, ids.alpha, 'assistant');
    const token = refreshCookie(await login({ email: 'leaver@alpha.test', password: PASSWORD }))!;
    await owner.query('DELETE FROM core.memberships WHERE user_id = $1', [user]);
    const response = await refresh(token);
    expect(response.statusCode).toBe(401);
  });
});

describe('sign-out', () => {
  it('revokes the family and clears the cookie', async () => {
    const token = refreshCookie(await login({ email: 'dentist@alpha.test', password: PASSWORD }))!;
    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { [REFRESH_COOKIE]: token },
      headers: { [CSRF_HEADER]: 'fetch' },
    });
    expect(logout.statusCode).toBe(204);
    const cleared = logout.cookies.find((cookie) => cookie.name === REFRESH_COOKIE);
    expect(cleared?.value).toBe('');
    expect((await refresh(token)).statusCode).toBe(401);
  });
});
