import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshSession: vi.fn(),
}));

vi.mock('../../services/token.service.js', () => ({
  refreshSession: mocks.refreshSession,
}));

import { refreshRoute } from '../../routes/refresh.js';

describe('routes/refresh', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with new token set', async () => {
    mocks.refreshSession.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    const app = Fastify();
    await app.register(refreshRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: 'old-refresh' },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.refreshSession).toHaveBeenCalledWith('old-refresh');
    await app.close();
  });

  it('returns error for invalid refresh payload', async () => {
    const app = Fastify();
    await app.register(refreshRoute);

    const response = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: '' },
    });

    expect(response.statusCode).toBe(500);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
    await app.close();
  });
});
