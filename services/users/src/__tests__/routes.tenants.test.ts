import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listTenants: vi.fn(),
  getTenantById: vi.fn(),
  createTenant: vi.fn(),
}));

vi.mock('../services/tenant.service.js', () => ({
  listTenants: mocks.listTenants,
  getTenantById: mocks.getTenantById,
  createTenant: mocks.createTenant,
}));

import { tenantsRoute } from '../routes/tenants.js';

describe('routes/tenants', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists tenants', async () => {
    mocks.listTenants.mockResolvedValue([{ id: 't1' }]);
    const app = Fastify();
    await app.register(tenantsRoute);

    const response = await app.inject({
      method: 'GET',
      url: '/tenants',
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('gets tenant by id with not-found branch', async () => {
    const app = Fastify();
    await app.register(tenantsRoute);

    mocks.getTenantById.mockResolvedValueOnce({ id: 't1' });
    let response = await app.inject({
      method: 'GET',
      url: '/tenants/11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(200);

    mocks.getTenantById.mockResolvedValueOnce(null);
    response = await app.inject({
      method: 'GET',
      url: '/tenants/11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('creates tenant and validates payload', async () => {
    mocks.createTenant.mockResolvedValue({ id: 't1' });
    const app = Fastify();
    await app.register(tenantsRoute);

    let response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Smile Dental',
        type: 'SOLO_PRACTICE',
      },
    });
    expect(response.statusCode).toBe(201);

    response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: '',
        type: '',
      },
    });
    expect(response.statusCode).toBe(500);
    await app.close();
  });
});
