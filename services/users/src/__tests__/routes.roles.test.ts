import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listRoles: vi.fn(),
  createRole: vi.fn(),
  deleteRole: vi.fn(),
}));

vi.mock('../services/role.service.js', () => ({
  listRoles: mocks.listRoles,
  createRole: mocks.createRole,
  deleteRole: mocks.deleteRole,
}));

import { rolesRoute } from '../routes/roles.js';

describe('routes/roles', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists roles', async () => {
    mocks.listRoles.mockResolvedValue([{ id: 'r1' }]);
    const app = Fastify();
    await app.register(rolesRoute);

    const response = await app.inject({
      method: 'GET',
      url: '/roles?tenantId=11111111-1111-4111-8111-111111111111',
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('creates role and validates payload', async () => {
    mocks.createRole.mockResolvedValue({ id: 'r1' });
    const app = Fastify();
    await app.register(rolesRoute);

    let response = await app.inject({
      method: 'POST',
      url: '/roles',
      payload: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        name: 'Manager',
        permissionKeys: ['users.read'],
      },
    });
    expect(response.statusCode).toBe(201);

    response = await app.inject({
      method: 'POST',
      url: '/roles',
      payload: {
        tenantId: 'not-uuid',
        name: '',
      },
    });
    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it('deletes role and handles not found', async () => {
    const app = Fastify();
    await app.register(rolesRoute);

    mocks.deleteRole.mockResolvedValueOnce(true);
    let response = await app.inject({
      method: 'DELETE',
      url: '/roles/11111111-1111-4111-8111-111111111111?tenantId=11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(204);

    mocks.deleteRole.mockResolvedValueOnce(false);
    response = await app.inject({
      method: 'DELETE',
      url: '/roles/11111111-1111-4111-8111-111111111111?tenantId=11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
