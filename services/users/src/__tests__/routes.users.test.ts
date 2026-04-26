import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('../services/user.service.js', () => ({
  listUsers: mocks.listUsers,
  getUserById: mocks.getUserById,
  createUser: mocks.createUser,
  updateUser: mocks.updateUser,
  deleteUser: mocks.deleteUser,
}));

import { usersRoute } from '../routes/users.js';

describe('routes/users', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists users', async () => {
    mocks.listUsers.mockResolvedValue([{ id: 'u1' }]);
    const app = Fastify();
    await app.register(usersRoute);

    const response = await app.inject({
      method: 'GET',
      url: '/users?tenantId=11111111-1111-4111-8111-111111111111',
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.listUsers).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('gets user by id and returns 404 when not found', async () => {
    const app = Fastify();
    await app.register(usersRoute);

    mocks.getUserById.mockResolvedValueOnce({ id: 'u1' });
    let response = await app.inject({
      method: 'GET',
      url: '/users/11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(200);

    mocks.getUserById.mockResolvedValueOnce(null);
    response = await app.inject({
      method: 'GET',
      url: '/users/11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('creates user and validates payload', async () => {
    mocks.createUser.mockResolvedValue({ id: 'u1' });
    const app = Fastify();
    await app.register(usersRoute);

    let response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'user@test.local',
        fullName: 'User Test',
      },
    });
    expect(response.statusCode).toBe(201);

    response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'bad-email',
        fullName: '',
      },
    });
    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it('updates and deletes user with not-found handling', async () => {
    const app = Fastify();
    await app.register(usersRoute);

    mocks.updateUser.mockResolvedValueOnce({ id: 'u1' });
    let response = await app.inject({
      method: 'PATCH',
      url: '/users/11111111-1111-4111-8111-111111111111',
      payload: { fullName: 'Updated User' },
    });
    expect(response.statusCode).toBe(200);

    mocks.updateUser.mockResolvedValueOnce(null);
    response = await app.inject({
      method: 'PATCH',
      url: '/users/11111111-1111-4111-8111-111111111111',
      payload: { fullName: 'Updated User' },
    });
    expect(response.statusCode).toBe(404);

    mocks.deleteUser.mockResolvedValueOnce(true);
    response = await app.inject({
      method: 'DELETE',
      url: '/users/11111111-1111-4111-8111-111111111111?tenantId=11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(204);

    mocks.deleteUser.mockResolvedValueOnce(false);
    response = await app.inject({
      method: 'DELETE',
      url: '/users/11111111-1111-4111-8111-111111111111?tenantId=11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
