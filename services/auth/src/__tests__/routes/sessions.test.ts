import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listActiveSessions: vi.fn(),
}));

vi.mock('../../services/session.service.js', () => ({
  listActiveSessions: mocks.listActiveSessions,
}));

import { sessionsRoute } from '../../routes/sessions.js';

describe('routes/sessions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns active sessions list', async () => {
    mocks.listActiveSessions.mockResolvedValue([
      {
        sessionId: 's1',
        userId: 'u1',
        tenantId: 't1',
        lastActivityAt: new Date().toISOString(),
      },
    ]);

    const app = Fastify();
    await app.register(sessionsRoute);

    const response = await app.inject({
      method: 'GET',
      url: '/sessions',
      headers: { authorization: 'Bearer token-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.listActiveSessions).toHaveBeenCalledWith('Bearer token-1');
    expect(Array.isArray(response.json().sessions)).toBe(true);
    await app.close();
  });
});
