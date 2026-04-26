import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authPlugin } from '../plugins/auth.js';

describe('auth plugin', () => {
  const jwtSecret = process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me-immediately';
  const jwtIssuer = process.env.JWT_ISSUER ?? 'dental-saas';
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(authPlugin);
    app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCodeRaw =
        typeof (error as Error & { statusCode?: number }).statusCode === 'number'
          ? (error as Error & { statusCode?: number }).statusCode
          : undefined;
      const statusCode = statusCodeRaw ?? 500;
      reply.code(statusCode).send({ error: error.message });
    });
    app.get('/protected', async (request: FastifyRequest) => {
      app.requireAuth(request);
      return { ok: true };
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects missing token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Missing bearer token.' });
  });

  it('accepts valid token', async () => {
    const token = jwt.sign(
      {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['USER'],
      },
      jwtSecret,
      { issuer: jwtIssuer }
    );

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
