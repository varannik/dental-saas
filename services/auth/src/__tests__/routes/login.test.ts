import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loginUser: vi.fn(),
}));

vi.mock('../../services/auth.service.js', () => ({
  loginUser: mocks.loginUser,
}));

import { loginRoute } from '../../routes/login.js';

describe('routes/login', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with login result', async () => {
    mocks.loginUser.mockResolvedValue({
      user: { id: 'u1', email: 'user@test.local', fullName: 'User' },
      sessionId: 's1',
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const app = Fastify();
    await app.register(loginRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email: 'user@test.local',
        password: 'Password123!',
        tenantId: '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.loginUser).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns error for invalid request payload', async () => {
    const app = Fastify();
    await app.register(loginRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email: 'not-an-email',
        password: 'short',
        tenantId: 'not-uuid',
      },
    });

    expect(response.statusCode).toBe(500);
    expect(mocks.loginUser).not.toHaveBeenCalled();
    await app.close();
  });
});
