import {
  diagnosisConfirm,
  diagnosisRecord,
  diagnosisReject,
  diagnosisRetract,
  diagnosisSuggest,
} from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../platform/auth.js';
import { withClinic, type Pool } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import { recordAccess } from '../audit/chain.js';
import type { CommandBus } from '../commands/bus.js';
import { actorFrom, idempotencyKey, sendOutcome } from '../commands/http.js';
import type { TokenService } from '../identity/tokens.js';
import { DIAGNOSIS_COLUMNS, toDiagnosis, type DiagnosisRow } from './commands.js';

/**
 * POST /v1/sessions/:id/diagnoses with status "suggested" (the default) or "confirmed";
 * PATCH /v1/diagnoses/:id with status "confirmed", "rejected" or "retracted" (spec section G);
 * GET /v1/patients/:id/diagnoses. Each status maps to its own command and permission.
 */

const idParams = z.object({ id: z.string().uuid() });
const addStatus = z.object({
  status: z.enum(['suggested', 'confirmed']).default('suggested'),
});
const decideBody = z.object({
  status: z.enum(['confirmed', 'rejected', 'retracted']),
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

const DECISIONS = {
  confirmed: diagnosisConfirm.type,
  rejected: diagnosisReject.type,
  retracted: diagnosisRetract.type,
} as const;

export async function registerDiagnosisRoutes(
  app: FastifyInstance,
  options: { pool: Pool; bus: CommandBus; tokens: TokenService }
) {
  const { pool, bus, tokens } = options;
  const signedIn = authenticate(tokens);

  app.post('/v1/sessions/:id/diagnoses', { preHandler: signedIn }, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    const { status, ...rest } = bodyOf(request.body);
    const { status: chosen } = parse(addStatus, { status });
    const outcome = await bus.execute(
      {
        type: chosen === 'confirmed' ? diagnosisRecord.type : diagnosisSuggest.type,
        payload: { ...rest, sessionId: id },
        idempotencyKey: idempotencyKey(request),
        source: 'gui',
      },
      actorFrom(request)
    );
    reply.status(201);
    return sendOutcome(reply, outcome);
  });

  app.patch('/v1/diagnoses/:id', { preHandler: signedIn }, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    const { status, reason } = parse(decideBody, request.body);
    return sendOutcome(
      reply,
      await bus.execute(
        {
          type: DECISIONS[status],
          payload: { diagnosisId: id, ...(reason === undefined ? {} : { reason }) },
          idempotencyKey: idempotencyKey(request),
          source: 'gui',
        },
        actorFrom(request)
      )
    );
  });

  app.get(
    '/v1/patients/:id/diagnoses',
    {
      preHandler: [signedIn, requirePermission('patient.read'), requirePermission('session.read')],
    },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const auth = request.auth!;
      return withClinic(pool, auth.clinicId, async (client) => {
        const found = await client.query('SELECT 1 FROM clinical.patients WHERE id = $1', [id]);
        if (!found.rowCount) throw new HttpProblem(404, 'not_found', 'Patient not found.');
        await recordAccess(client, {
          clinicId: auth.clinicId,
          actorId: auth.userId,
          patientId: id,
          purpose: 'patient.diagnoses',
          requestId: request.id,
        });
        const { rows } = await client.query<DiagnosisRow>(
          `SELECT ${DIAGNOSIS_COLUMNS} FROM clinical.diagnoses
           WHERE patient_id = $1 ORDER BY suggested_at DESC, id DESC`,
          [id]
        );
        return { diagnoses: rows.map(toDiagnosis) };
      });
    }
  );
}
