import { clinicUpdateSettings } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../platform/auth.js';
import type { TokenService } from '../identity/tokens.js';
import type { CommandBus } from '../commands/bus.js';
import { actorFrom, idempotencyKey, sendOutcome } from '../commands/http.js';

/** PATCH /v1/clinic: change the clinic's settings through the command bus. */
export async function registerClinicRoutes(
  app: FastifyInstance,
  options: { bus: CommandBus; tokens: TokenService }
) {
  app.patch('/v1/clinic', { preHandler: authenticate(options.tokens) }, async (request, reply) =>
    sendOutcome(
      reply,
      await options.bus.execute(
        {
          type: clinicUpdateSettings.type,
          payload: request.body,
          idempotencyKey: idempotencyKey(request),
          source: 'gui',
        },
        actorFrom(request)
      )
    )
  );
}
