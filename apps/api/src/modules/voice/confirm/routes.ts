import type { PendingProposal, VoiceConfirmResponse } from '@dental/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../../platform/auth.js';
import { HttpProblem } from '../../../platform/http-problem.js';
import { actorFrom } from '../../commands/http.js';
import type { TokenService } from '../../identity/tokens.js';
import type { ProposalService } from './proposals.js';

/**
 * The pending proposal from the screen (V6). A request here is a click: it can confirm R2 and R3.
 *
 *   POST /v1/voice/proposals/:id/confirm   run it, once
 *   POST /v1/voice/proposals/:id/edit      change entities, typed; becomes a new proposal
 *   POST /v1/voice/proposals/:id/cancel    discard it
 *   POST /v1/voice/undo                    propose the inverse of the last voice command
 */

const idParams = z.object({ id: z.string().min(1).max(64) });
const confirmBody = z.object({ contextVersion: z.number().int().min(0) }).strict();
const editBody = z
  .object({
    contextVersion: z.number().int().min(0),
    entities: z.record(z.string().regex(/^[a-z][a-zA-Z]*$/), z.string().max(1_000)),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpProblem(400, 'validation_failed', 'The request is not valid.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

const keyOf = (request: FastifyRequest) => ({
  clinicId: request.auth!.clinicId,
  userId: request.auth!.userId,
});

export async function registerProposalRoutes(
  app: FastifyInstance,
  options: { tokens: TokenService; proposals: ProposalService }
) {
  const guard = [authenticate(options.tokens), requirePermission('voice.use')];
  const { proposals } = options;

  app.post(
    '/v1/voice/proposals/:id/confirm',
    { preHandler: guard },
    async (request): Promise<VoiceConfirmResponse> => {
      const { id } = parse(idParams, request.params);
      const { contextVersion } = parse(confirmBody, request.body);
      const actor = actorFrom(request);
      return proposals.confirm(
        { ...actor, userId: request.auth!.userId },
        id,
        contextVersion,
        'click'
      );
    }
  );

  app.post(
    '/v1/voice/proposals/:id/edit',
    { preHandler: guard },
    async (request): Promise<PendingProposal> => {
      const { id } = parse(idParams, request.params);
      const body = parse(editBody, request.body);
      return proposals.correct(keyOf(request), id, body.contextVersion, body.entities);
    }
  );

  app.post('/v1/voice/proposals/:id/cancel', { preHandler: guard }, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    if (!(await proposals.cancel(keyOf(request), id))) {
      throw new HttpProblem(404, 'not_found', 'There is no such proposal waiting.');
    }
    reply.status(204);
  });

  app.post('/v1/voice/undo', { preHandler: guard }, async (request): Promise<PendingProposal> =>
    proposals.undo(keyOf(request))
  );
}
