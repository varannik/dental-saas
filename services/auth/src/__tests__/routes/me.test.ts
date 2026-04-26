import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentSessionUser: vi.fn(),
}));

vi.mock('../../services/session.service.js', () => ({
  getCurrentSessionUser: mocks.getCurrentSessionUser,
}));

import { meRoute } from '../../routes/me.js';

describe('routes/me', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns current session user', async () => {
    mocks.getCurrentSessionUser.mockResolvedValue({
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    const app = Fastify();
    await app.register(meRoute);

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer token-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.getCurrentSessionUser).toHaveBeenCalledWith('Bearer token-1');
    expect(response.json()).toEqual({
      user: { userId: 'user-1', tenantId: 'tenant-1' },
    });
    await app.close();
  });
});
