import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpProblem } from '../../platform/http-problem.js';
import type { Actor, CommandOutcome } from './bus.js';

/** Helpers for REST routes, which only translate HTTP into commands (spec section G). */

/** Every write needs an Idempotency-Key header, so a retried request cannot apply twice. */
export function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new HttpProblem(400, 'validation_failed', 'An Idempotency-Key header is required.', {
      issues: [
        { path: 'Idempotency-Key', message: 'Send 1 to 200 characters, for example a UUID.' },
      ],
    });
  }
  return value.trim();
}

/** The actor for a request that passed authenticate. */
export function actorFrom(request: FastifyRequest): Actor {
  const auth = request.auth;
  if (!auth) throw new HttpProblem(401, 'unauthenticated', 'Sign in to continue.');
  return {
    userId: auth.userId,
    clinicId: auth.clinicId,
    permissions: auth.permissions,
    requestId: request.id,
    ip: request.ip,
  };
}

/** Sends a command's result, marking a replay so clients can tell. */
export function sendOutcome(reply: FastifyReply, outcome: CommandOutcome) {
  reply.header('command-id', outcome.commandId);
  if (outcome.replayed) reply.header('idempotent-replayed', 'true');
  return outcome.result;
}
