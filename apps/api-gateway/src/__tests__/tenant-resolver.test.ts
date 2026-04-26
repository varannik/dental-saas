import Fastify, { type FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { tenantResolverMiddleware } from '../middleware/tenant-resolver.js';

describe('tenant-resolver middleware', () => {
  const jwtSecret = process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me-immediately';
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(tenantResolverMiddleware);
    app.get('/whoami', async (request: FastifyRequest) => ({
      tenantId: request.tenantId ?? null,
      userId: request.userId ?? null,
      roles: request.roles ?? [],
    }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('extracts tenant and user claims from valid JWT', async () => {
    const token = jwt.sign(
      {
        userId: 'user-42',
        tenantId: 'tenant-42',
        roles: ['ADMIN'],
      },
      jwtSecret
    );

    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tenantId: 'tenant-42',
      userId: 'user-42',
      roles: ['ADMIN'],
    });
  });

  it('leaves tenant context empty for missing header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tenantId: null,
      userId: null,
      roles: [],
    });
  });
});
