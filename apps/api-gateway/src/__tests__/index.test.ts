import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../index.js';

describe('api-gateway', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const jwtSecret = process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me-immediately';
  const jwtIssuer = process.env.JWT_ISSUER ?? 'dental-saas';

  const issueToken = (roles: string[] = ['USER']): string =>
    jwt.sign(
      {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles,
      },
      jwtSecret,
      {
        issuer: jwtIssuer,
      }
    );

  beforeAll(async () => {
    app = await buildServer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api-gateway');
  });

  it('registers CORS OPTIONS route handler', () => {
    const routes = app.printRoutes();
    expect(routes).toContain('* (OPTIONS)');
  });

  it('rejects protected patients route when token is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/list',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Missing bearer token.' });
  });

  it('accepts valid token and returns patients placeholder response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/list',
      headers: {
        authorization: `Bearer ${issueToken(['ADMIN'])}`,
      },
    });

    expect(response.statusCode).toBe(501);
    expect(response.json()).toEqual({
      message: 'Patients proxy route not implemented yet.',
    });
  });

  it('proxies auth route to auth service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'x-request-id': 'req-123',
      },
      payload: {
        email: 'test@local',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4001/auth/register');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ email: 'test@local' }));
    expect((options.headers as Record<string, string>)['x-request-id']).toBe('req-123');
    expect(response.json()).toEqual({ ok: true });
  });

  it('returns 500 with error contract when upstream proxy fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Upstream service unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'fail@local',
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Upstream service unavailable' });
  });

  it('rejects users route when token is invalid', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/users/profile',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid token.' });
  });

  it('proxies users route when token is valid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ profile: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const token = issueToken(['ADMIN']);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/users/profile',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4002/users/profile');
    expect(response.json()).toEqual({ profile: true });
  });

  it('proxies tenant creation route to users service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tenant: { id: 't1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const token = issueToken(['ADMIN']);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        name: 'Gateway Smile Clinic',
        type: 'SOLO_PRACTICE',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4002/tenants');
    expect(options.method).toBe('POST');
    expect(response.json()).toEqual({ tenant: { id: 't1' } });
  });

  it('registers websocket voice route', () => {
    const routes = app.printRoutes();
    expect(routes).toContain('voice/ws (GET, HEAD)');
  });
});
