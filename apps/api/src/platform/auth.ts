import type { PermissionKey } from '@dental/contracts';
import type { FastifyRequest } from 'fastify';
import type { AccessClaims, TokenService } from '../modules/identity/tokens.js';
import { HttpProblem } from './http-problem.js';

/**
 * Request guards. Permissions come from the access token and can be up to one token lifetime
 * (10 minutes) stale; row-level security in PostgreSQL is the independent second check.
 */

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessClaims;
  }
}

export function authenticate(tokens: TokenService) {
  return async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const claims = token ? await tokens.verifyAccess(token) : null;
    if (!claims) throw new HttpProblem(401, 'unauthenticated', 'Sign in to continue.');
    request.auth = claims;
  };
}

/** Use after authenticate. Deny by default. */
export function requirePermission(permission: PermissionKey) {
  return async (request: FastifyRequest) => {
    if (!request.auth?.permissions.includes(permission)) {
      throw new HttpProblem(403, 'forbidden', 'You do not have permission to do this.');
    }
  };
}
