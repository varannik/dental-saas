import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
  count: 0,
  throwOnIncr: false,
}));

vi.mock('ioredis', () => ({
  Redis: class {
    async incr(): Promise<number> {
      if (redisState.throwOnIncr) {
        throw new Error('Redis unavailable');
      }
      redisState.count += 1;
      return redisState.count;
    }

    async expire(): Promise<number> {
      return 1;
    }

    disconnect(): void {}
  },
}));

import { rateLimitPlugin } from '../plugins/rate-limit.js';

describe('rate-limit plugin', () => {
  beforeEach(async () => {
    redisState.count = 0;
    redisState.throwOnIncr = false;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('returns 429 when request count exceeds role limit', async () => {
    const app = Fastify();
    await app.register(rateLimitPlugin);
    app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCodeRaw =
        typeof (error as Error & { statusCode?: number }).statusCode === 'number'
          ? (error as Error & { statusCode?: number }).statusCode
          : undefined;
      const statusCode = statusCodeRaw ?? 500;
      reply.code(statusCode).send({ error: error.message });
    });
    app.get('/limited', async () => {
      await app.rateLimitGuard({
        endpoint: 'limited',
        role: 'public',
      });
      return { ok: true };
    });
    await app.ready();

    for (let i = 0; i < 100; i += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/limited',
      });
      expect(response.statusCode).toBe(200);
    }

    const blocked = await app.inject({
      method: 'GET',
      url: '/limited',
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: 'Rate limit exceeded.' });
    await app.close();
  });

  it('allows requests even when redis backend is unavailable', async () => {
    redisState.throwOnIncr = true;
    const app = Fastify();
    await app.register(rateLimitPlugin);
    app.get('/limited', async () => {
      await app.rateLimitGuard({
        endpoint: 'limited',
        role: 'public',
      });
      return { ok: true };
    });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/limited',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });
});
