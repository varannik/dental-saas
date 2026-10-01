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
});
