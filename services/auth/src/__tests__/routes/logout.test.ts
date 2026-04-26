import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logoutUser: vi.fn(),
}));

vi.mock('../../services/auth.service.js', () => ({
  logoutUser: mocks.logoutUser,
}));

import { logoutRoute } from '../../routes/logout.js';

describe('routes/logout', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 and forwards authorization header', async () => {
    const app = Fastify();
    await app.register(logoutRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: { authorization: 'Bearer token-1' },
    });

    expect(response.statusCode).toBe(204);
    expect(mocks.logoutUser).toHaveBeenCalledWith('Bearer token-1');
    await app.close();
  });
});
