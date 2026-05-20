import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createTenantWithCreatorAsAdmin: vi.fn(),
  listTenants: vi.fn(),
  getTenantById: vi.fn(),
  createTenant: vi.fn(),
  verifyAccessTokenFromAuthorizationHeader: vi.fn(),
}));

vi.mock('../services/tenant.service.js', () => ({
  createTenant: mocks.createTenant,
  createTenantWithCreatorAsAdmin: mocks.createTenantWithCreatorAsAdmin,
  getTenantById: mocks.getTenantById,
  listTenants: mocks.listTenants,
}));

vi.mock('../lib/verify-access-token.js', () => ({
  verifyAccessTokenFromAuthorizationHeader: mocks.verifyAccessTokenFromAuthorizationHeader,
}));

import { tenantsRoute } from '../routes/tenants.js';

describe('routes/tenants/with-membership', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without valid JWT', async () => {
    mocks.verifyAccessTokenFromAuthorizationHeader.mockReturnValue(null);
    const app = Fastify();
    await app.register(tenantsRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/with-membership',
      payload: { name: 'Clinic', type: 'SOLO_PRACTICE' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 201 and tenant when JWT valid', async () => {
    mocks.verifyAccessTokenFromAuthorizationHeader.mockReturnValue({
      userId: 'u-1',
      tenantId: '11111111-1111-4111-8111-111111111111',
      sessionId: 's-1',
      roles: ['ADMIN'],
      permissions: [],
    });
    mocks.createTenantWithCreatorAsAdmin.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'New Clinic',
    });

    const app = Fastify();
    await app.register(tenantsRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/with-membership',
      headers: { authorization: 'Bearer fake' },
      payload: { name: 'New Clinic', type: 'SOLO_PRACTICE' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as { tenant: { id: string } };
    expect(body.tenant.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(mocks.createTenantWithCreatorAsAdmin).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        name: 'New Clinic',
        type: 'SOLO_PRACTICE',
      })
    );
    await app.close();
  });
});
