import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('api server', () => {
  it('reports liveness and readiness', async () => {
    const app = await buildServer();
    const live = await app.inject({ method: 'GET', url: '/healthz' });
    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });
    expect(ready.statusCode).toBe(200);
    expect(live.headers['x-request-id']).toEqual(expect.any(String));
    await app.close();
  });

  it('keeps a caller-supplied request id', async () => {
    const app = await buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'req-123' },
    });
    expect(response.headers['x-request-id']).toBe('req-123');
    await app.close();
  });

  it('returns problem JSON for an unknown route', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/missing' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      status: 404,
      code: 'not_found',
      requestId: expect.any(String),
    });
    await app.close();
  });

  it('lets the web app send updates across origins', async () => {
    const app = await buildServer({ corsOrigin: 'http://localhost:3000' });
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/patients/x',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type,idempotency-key',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-methods']).toContain('PATCH');
    expect(preflight.headers['access-control-allow-headers']).toContain('idempotency-key');
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    await app.close();
  });

  it('allows a busy clinic 1200 requests a minute per address, not counting preflights', async () => {
    const app = await buildServer({ corsOrigin: 'http://localhost:3000' });
    const remaining = async () =>
      Number(
        (await app.inject({ method: 'GET', url: '/healthz' })).headers['x-ratelimit-remaining']
      );
    const before = await remaining();
    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: 'OPTIONS',
        url: '/v1/sessions/x',
        headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' },
      });
    }
    expect(before).toBe(1199);
    expect(await remaining()).toBe(1198);
    await app.close();
  });
});
