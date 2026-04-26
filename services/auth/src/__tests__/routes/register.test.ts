import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerUser: vi.fn(),
}));

vi.mock('../../services/auth.service.js', () => ({
  registerUser: mocks.registerUser,
}));

import { registerRoute } from '../../routes/register.js';

describe('routes/register', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 with user payload', async () => {
    mocks.registerUser.mockResolvedValue({
      id: 'u1',
      email: 'user@test.local',
      fullName: 'User',
    });

    const app = Fastify();
    await app.register(registerRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: 'user@test.local',
        password: 'Password123!',
        fullName: 'User',
        tenantId: '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mocks.registerUser).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns error for invalid request payload', async () => {
    const app = Fastify();
    await app.register(registerRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: 'bad-email',
        password: 'short',
        fullName: '',
        tenantId: 'not-uuid',
      },
    });

    expect(response.statusCode).toBe(500);
    expect(mocks.registerUser).not.toHaveBeenCalled();
    await app.close();
  });
});
