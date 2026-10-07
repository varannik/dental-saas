import type { VoiceContext } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../../platform/auth.js';
import { HttpProblem } from '../../../platform/http-problem.js';
import type { TokenService } from '../../identity/tokens.js';
import type { VoiceContextService } from './service.js';

/**
 * GET /v1/voice/context          the clinician's voice context
 * PUT /v1/voice/context/focus    what is on screen now; omitted levels are cleared
 */

const focusBody = z
  .object({
    patientId: z.string().uuid().nullable(),
    sessionId: z.string().uuid().nullable().optional(),
    procedureId: z.string().uuid().nullable().optional(),
    tooth: z.string().max(2).nullable().optional(),
  })
  .strict();

export async function registerVoiceContextRoutes(
  app: FastifyInstance,
  options: { tokens: TokenService; context: VoiceContextService }
) {
  const guard = [authenticate(options.tokens), requirePermission('voice.use')];
  const keyOf = (auth: { clinicId: string; userId: string }) => ({
    clinicId: auth.clinicId,
    userId: auth.userId,
  });

  app.get('/v1/voice/context', { preHandler: guard }, async (request): Promise<VoiceContext> =>
    options.context.get(keyOf(request.auth!))
  );

  app.put(
    '/v1/voice/context/focus',
    { preHandler: guard },
    async (request): Promise<VoiceContext> => {
      const parsed = focusBody.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpProblem(400, 'validation_failed', 'The request is not valid.', {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      return options.context.focus(keyOf(request.auth!), parsed.data);
    }
  );
}
