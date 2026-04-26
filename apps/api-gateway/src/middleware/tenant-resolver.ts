import jwt from 'jsonwebtoken';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    userId?: string;
    roles?: string[];
  }
}

interface JwtClaims {
  userId?: string;
  tenantId?: string;
  roles?: string[];
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me-immediately';
}

const tenantResolverMiddlewareImpl: FastifyPluginAsync = async (app): Promise<void> => {
  app.addHook('preHandler', async (request) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return;

    const token = auth.slice('Bearer '.length).trim();
    if (!token) return;

    try {
      const claims = jwt.verify(token, getJwtSecret()) as JwtClaims;
      request.tenantId = claims.tenantId;
      request.userId = claims.userId;
      request.roles = claims.roles;
    } catch {
      // Ignore decode failures here; strict JWT enforcement is handled by auth plugin on protected routes.
    }
  });
};

export const tenantResolverMiddleware = fp(tenantResolverMiddlewareImpl, {
  name: 'gateway-tenant-resolver-middleware',
});
