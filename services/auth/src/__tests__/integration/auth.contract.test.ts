import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../../index.js';
import {
  assertHttpStatus,
  assertIntegrationDatabaseReady,
  AuthInjectClient,
  clearIntegrationData,
  createTestEmail,
  DEFAULT_PASSWORD,
  DEMO_TENANT_ID,
  setupIntegrationData,
} from './helpers.js';

const maybeDescribe = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

function expectString(value: unknown, field: string): void {
  expect(typeof value, `${field} must be a string`).toBe('string');
  expect((value as string).length, `${field} cannot be empty`).toBeGreaterThan(0);
}

maybeDescribe('auth contract', () => {
  let app: FastifyInstance;
  let client: AuthInjectClient;

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
    await setupIntegrationData();
    app = await buildServer();
    client = new AuthInjectClient(app);
  });

  afterAll(async () => {
    await clearIntegrationData();
    await app.close();
    const { closeDatabase } = await import('@saas/config');
    await closeDatabase();
  });

  it('respects response contracts across main auth endpoints', async () => {
    const email = createTestEmail();

    const register = await client.post('/auth/register', {
      email,
      password: DEFAULT_PASSWORD,
      fullName: 'Contract User',
      tenantId: DEMO_TENANT_ID,
    });
    assertHttpStatus(register, 201, 'POST /auth/register');
    const registerBody = register.data as {
      user?: { id?: string; email?: string; fullName?: string };
    };
    expectString(registerBody.user?.id, 'register.user.id');
    expect(registerBody.user?.email).toBe(email);
    expect(registerBody.user?.fullName).toBe('Contract User');

    const login = await client.post('/auth/login', {
      email,
      password: DEFAULT_PASSWORD,
      tenantId: DEMO_TENANT_ID,
    });
    assertHttpStatus(login, 200, 'POST /auth/login');
    const loginBody = login.data as {
      user?: { id?: string; email?: string; fullName?: string };
      sessionId?: string;
      accessToken?: string;
      refreshToken?: string;
    };
    expectString(loginBody.user?.id, 'login.user.id');
    expect(loginBody.user?.email).toBe(email);
    expectString(loginBody.sessionId, 'login.sessionId');
    expectString(loginBody.accessToken, 'login.accessToken');
    expectString(loginBody.refreshToken, 'login.refreshToken');

    client.setAuthToken(loginBody.accessToken ?? null);
    const me = await client.get('/auth/me');
    assertHttpStatus(me, 200, 'GET /auth/me');
    const meBody = me.data as { user?: { userId?: string; tenantId?: string } | null };
    expectString(meBody.user?.userId, 'me.user.userId');
    expect(meBody.user?.tenantId).toBe(DEMO_TENANT_ID);

    const sessions = await client.get('/auth/sessions');
    assertHttpStatus(sessions, 200, 'GET /auth/sessions');
    const sessionsBody = sessions.data as {
      sessions?: Array<{
        sessionId?: string;
        userId?: string;
        tenantId?: string;
        lastActivityAt?: string;
      }>;
    };
    expect(Array.isArray(sessionsBody.sessions)).toBe(true);
    expect((sessionsBody.sessions ?? []).length).toBeGreaterThan(0);
    expectString(sessionsBody.sessions?.[0]?.sessionId, 'sessions[0].sessionId');
    expectString(sessionsBody.sessions?.[0]?.userId, 'sessions[0].userId');
    expect(sessionsBody.sessions?.[0]?.tenantId).toBe(DEMO_TENANT_ID);
    expectString(sessionsBody.sessions?.[0]?.lastActivityAt, 'sessions[0].lastActivityAt');

    const refresh = await client.post('/auth/refresh', {
      refreshToken: loginBody.refreshToken,
    });
    assertHttpStatus(refresh, 200, 'POST /auth/refresh');
    const refreshBody = refresh.data as { accessToken?: string; refreshToken?: string };
    expectString(refreshBody.accessToken, 'refresh.accessToken');
    expectString(refreshBody.refreshToken, 'refresh.refreshToken');
  });
});
