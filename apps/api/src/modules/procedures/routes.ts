import {
  procedureCancel,
  procedureComplete,
  procedureStart,
  sessionAmend,
  sessionSign,
} from '@dental/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../platform/auth.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { CommandBus } from '../commands/bus.js';
import { actorFrom, idempotencyKey, sendOutcome } from '../commands/http.js';
import type { TokenService } from '../identity/tokens.js';

/**
 * POST  /v1/sessions/:id/procedures   procedure.start
 * PATCH /v1/procedures/:id            status "completed" or "cancelled" (spec section G)
 * POST  /v1/sessions/:id/sign         session.sign: a click, never voice alone
 * POST  /v1/sessions/:id/amendments   session.amend: reason and actions
 */

const idParams = z.object({ id: z.string().uuid() });
const finishBody = z.object({
  status: z.enum(['completed', 'cancelled']),
  reason: z.string().optional(),
});

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

const bodyOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

export async function registerProcedureRoutes(
  app: FastifyInstance,
  options: { bus: CommandBus; tokens: TokenService }
) {
  const { bus, tokens } = options;
  const signedIn = authenticate(tokens);

  const command =
    (
      type: (request: FastifyRequest) => string,
      status: number,
      payloadOf: (request: FastifyRequest) => Record<string, unknown>
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const outcome = await bus.execute(
        {
          type: type(request),
          payload: payloadOf(request),
          idempotencyKey: idempotencyKey(request),
          source: 'gui',
        },
        actorFrom(request)
      );
      reply.status(status);
      return sendOutcome(reply, outcome);
    };

  const sessionPayload = (request: FastifyRequest) => ({
    ...bodyOf(request.body),
    sessionId: parse(idParams, request.params).id,
  });

  app.post(
    '/v1/sessions/:id/procedures',
    { preHandler: signedIn },
    command(() => procedureStart.type, 201, sessionPayload)
  );
  app.patch(
    '/v1/procedures/:id',
    { preHandler: signedIn },
    command(
      (request) =>
        parse(finishBody, request.body).status === 'completed'
          ? procedureComplete.type
          : procedureCancel.type,
      200,
      (request) => {
        const { reason } = parse(finishBody, request.body);
        return {
          procedureId: parse(idParams, request.params).id,
          ...(reason === undefined ? {} : { reason }),
        };
      }
    )
  );
  app.post(
    '/v1/sessions/:id/sign',
    { preHandler: signedIn },
    command(
      () => sessionSign.type,
      200,
      (request) => ({
        sessionId: parse(idParams, request.params).id,
      })
    )
  );
  app.post(
    '/v1/sessions/:id/amendments',
    { preHandler: signedIn },
    command(() => sessionAmend.type, 201, sessionPayload)
  );
}
