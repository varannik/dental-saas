import jwt from 'jsonwebtoken';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: { headers: { authorization?: string | string[] } }) => void;
  }
}

interface JwtPayload {
  userId: string;
  tenantId: string;
  roles: string[];
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me-immediately';
}

function getJwtIssuer(): string {
  return process.env.JWT_ISSUER ?? 'dental-saas';
}

const authPluginImpl: FastifyPluginAsync = async (app): Promise<void> => {
  const unauthorized = (message: string): Error & { statusCode: number } => {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = 401;
    return error;
  };

  app.decorate('requireAuth', (request: { headers: { authorization?: string | string[] } }) => {
    const rawAuth = request.headers.authorization;
    const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    if (!auth?.startsWith('Bearer ')) {
      throw unauthorized('Missing bearer token.');
    }

    const token = auth.slice('Bearer '.length).trim();
    if (!token) {
      throw unauthorized('Missing bearer token.');
    }

    try {
      jwt.verify(token, getJwtSecret(), { issuer: getJwtIssuer() }) as JwtPayload;
    } catch {
      throw unauthorized('Invalid token.');
    }
  });
};

export const authPlugin = fp(authPluginImpl, {
  name: 'gateway-auth-plugin',
});
