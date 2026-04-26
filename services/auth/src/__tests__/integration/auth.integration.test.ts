import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
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
    expect(register.status).toBe(201);

    const login = await client.post('/auth/login', {
      email,
      password: DEFAULT_PASSWORD,
      tenantId: DEMO_TENANT_ID,
    });
    expect(login.status).toBe(200);
    const loginBody = login.data as { accessToken?: string; refreshToken?: string };
    expect(loginBody.accessToken).toBeTypeOf('string');
    expect(loginBody.refreshToken).toBeTypeOf('string');
  });

  it('invalidates me response after logout', async () => {
    const email = createTestEmail();
    await client.post('/auth/register', {
      email,
      password: DEFAULT_PASSWORD,
      fullName: 'Integration Logout User',
      tenantId: DEMO_TENANT_ID,
    });

    const login = await client.post('/auth/login', {
      email,
      password: DEFAULT_PASSWORD,
      tenantId: DEMO_TENANT_ID,
    });
    expect(login.status).toBe(200);
    const loginBody = login.data as { accessToken?: string };
    client.setAuthToken(loginBody.accessToken ?? null);

    const meBefore = await client.get('/auth/me');
    expect(meBefore.status).toBe(200);
    expect((meBefore.data as { user?: unknown }).user).toBeTruthy();

    const logout = await client.post('/auth/logout');
    expect(logout.status).toBe(204);

    const meAfter = await client.get('/auth/me');
    expect(meAfter.status).toBe(200);
    expect((meAfter.data as { user?: unknown }).user).toBeNull();
  });
});
