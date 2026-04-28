import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    userId?: string;
  }
}

function getJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : 'dev-only-jwt-secret-change-me-immediately';
}

function getJwtIssuer(): string {
  return process.env.JWT_ISSUER ?? 'dental-saas';
}

function parseAccessClaims(token: string): { userId: string; tenantId: string } | null {
  const payload = jwt.verify(token, getJwtSecret(), {
    issuer: getJwtIssuer(),
  }) as Record<string, unknown>;

  const userId = payload.userId;
  const tenantId = payload.tenantId;
  if (typeof userId !== 'string' || typeof tenantId !== 'string' || !userId || !tenantId) {
    return null;
  }
  return { userId, tenantId };
}

const requireBearerTenantContext = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const raw = request.headers.authorization;
  const auth = Array.isArray(raw) ? raw[0] : raw;
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing bearer token.' });
  }
  const token = auth.slice('Bearer '.length).trim();
  if (!token) {
    return reply.code(401).send({ error: 'Missing bearer token.' });
  }

  let claims: { userId: string; tenantId: string } | null;
  try {
    claims = parseAccessClaims(token);
  } catch {
    return reply.code(401).send({ error: 'Invalid access token.' });
  }
  if (claims == null) {
    return reply.code(401).send({ error: 'Invalid access token claims.' });
  }
  request.userId = claims.userId;
  request.tenantId = claims.tenantId;
};

/**
 * Add this hook on the same Fastify instance (or parent) that registers `/patients` routes,
 * so authentication runs for the subtrees. Avoid registering as a separate sibling plugin, or
 * hooks may not apply to prefixed child routes in all versions.
 */
export { requireBearerTenantContext as requireClinicalPreHandler };
