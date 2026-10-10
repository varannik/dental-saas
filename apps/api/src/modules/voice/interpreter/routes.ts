import type { VoiceInterpretation } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../../platform/auth.js';
import { HttpProblem } from '../../../platform/http-problem.js';
import type { TokenService } from '../../identity/tokens.js';
import { INTERPRETER_IDS } from '../interpreters.js';
import type { InterpretationService } from './service.js';

/**
 * POST /v1/voice/interpret   typed text through the same pipeline as speech (V4): for tests,
 * for typed commands, and for when speaking is not practical.
 */

const body = z
  .object({
    text: z.string().trim().min(1).max(2_000),
    interpreter: z.enum(INTERPRETER_IDS).optional(),
  })
  .strict();

export async function registerInterpretRoutes(
  app: FastifyInstance,
  options: { tokens: TokenService; interpretation: InterpretationService | null }
) {
  app.post(
    '/v1/voice/interpret',
    {
      preHandler: [authenticate(options.tokens), requirePermission('voice.use')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request): Promise<VoiceInterpretation> => {
      if (!options.interpretation) {
        throw new HttpProblem(503, 'internal_error', 'No interpreter is configured on the server.');
      }
      const parsed = body.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpProblem(400, 'validation_failed', 'The request is not valid.', {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      const auth = request.auth!;
      return options.interpretation.interpret(
        { clinicId: auth.clinicId, userId: auth.userId, permissions: auth.permissions },
        { text: parsed.data.text, source: 'text', interpreter: parsed.data.interpreter }
      );
    }
  );
}
