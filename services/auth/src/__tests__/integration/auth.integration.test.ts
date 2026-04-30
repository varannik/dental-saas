import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertHttpStatus,
  assertIntegrationDatabaseReady,
  AuthTestClient,
  clearIntegrationData,
  createTestEmail,
  DEFAULT_PASSWORD,
  DEMO_TENANT_ID,
  setupIntegrationData,
} from './helpers.js';

const maybeDescribe = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

maybeDescribe('auth integration', () => {
  let client: AuthTestClient;

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
    await setupIntegrationData();
    client = new AuthTestClient();
  });

  afterAll(async () => {
    await clearIntegrationData();
  });

  it('registers and logs in a user', async () => {
    const email = createTestEmail();

    const register = await client.post('/auth/register', {
      email,
      password: DEFAULT_PASSWORD,
      fullName: 'Integration User',
      tenantId: DEMO_TENANT_ID,
    });
    assertHttpStatus(register, 201, 'POST /auth/register');

    const login = await client.post('/auth/login', {
      email,
      password: DEFAULT_PASSWORD,
      tenantId: DEMO_TENANT_ID,
    });
    assertHttpStatus(login, 200, 'POST /auth/login');
    const loginBody = login.data as { accessToken?: string; refreshToken?: string };
    expect(loginBody.accessToken).toBeTypeOf('string');
    expect(loginBody.refreshToken).toBeTypeOf('string');
  });

  it('invalidates me response after logout', async () => {
    const email = createTestEmail();
    const registerFirst = await client.post('/auth/register', {
      email,
      password: DEFAULT_PASSWORD,
      fullName: 'Integration Logout User',
      tenantId: DEMO_TENANT_ID,
    });
    assertHttpStatus(registerFirst, 201, 'POST /auth/register (logout flow)');

    const login = await client.post('/auth/login', {
      email,
      password: DEFAULT_PASSWORD,
      tenantId: DEMO_TENANT_ID,
    });
    assertHttpStatus(login, 200, 'POST /auth/login (logout flow)');
    const loginBody = login.data as { accessToken?: string };
    client.setAuthToken(loginBody.accessToken ?? null);

    const meBefore = await client.get('/auth/me');
    assertHttpStatus(meBefore, 200, 'GET /auth/me (before logout)');
    expect((meBefore.data as { user?: unknown }).user).toBeTruthy();

    const logout = await client.post('/auth/logout');
    assertHttpStatus(logout, 204, 'POST /auth/logout');

    const meAfter = await client.get('/auth/me');
    assertHttpStatus(meAfter, 200, 'GET /auth/me (after logout)');
    expect((meAfter.data as { user?: unknown }).user).toBeNull();
  });
});
