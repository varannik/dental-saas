import { patientCreate, patientUpdate } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../platform/auth.js';
import { withClinic, type Pool } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { SecretBox } from '../../platform/secret-box.js';
import { recordAccess } from '../audit/chain.js';
import type { CommandBus } from '../commands/bus.js';
import { actorFrom, idempotencyKey, sendOutcome } from '../commands/http.js';
import type { TokenService } from '../identity/tokens.js';
import { PATIENT_COLUMNS, toView, type PatientRow } from './model.js';
import { searchPatients } from './search.js';

/**
 * GET /v1/patients?q=, POST /v1/patients, GET and PATCH /v1/patients/:id.
 * Writes go through the command bus. Every search and every profile read is recorded in the
 * access log, in the same transaction as the read (spec section F).
 */

const searchQuery = z.object({
  q: z.string().trim().min(2, 'Search with at least 2 characters.').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  includeArchived: z.stringbool().default(false),
});

const idParams = z.object({ id: z.string().uuid() });

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

export async function registerPatientRoutes(
  app: FastifyInstance,
  options: { pool: Pool; bus: CommandBus; tokens: TokenService; secrets: SecretBox }
) {
  const { pool, bus, tokens, secrets } = options;
  const signedIn = authenticate(tokens);

  app.get(
    '/v1/patients',
    { preHandler: [signedIn, requirePermission('patient.read')] },
    async (request) => {
      const { q, limit, includeArchived } = parse(searchQuery, request.query);
      const auth = request.auth!;
      return withClinic(pool, auth.clinicId, async (client) => {
        await recordAccess(client, {
          clinicId: auth.clinicId,
          actorId: auth.userId,
          purpose: 'patient.search',
          requestId: request.id,
        });
        return { results: await searchPatients(client, q, { limit, includeArchived }) };
      });
    }
  );

  app.get(
    '/v1/patients/:id',
    { preHandler: [signedIn, requirePermission('patient.read')] },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const auth = request.auth!;
      return withClinic(pool, auth.clinicId, async (client) => {
        const row = (
          await client.query<PatientRow>(
            `SELECT ${PATIENT_COLUMNS} FROM clinical.patients WHERE id = $1`,
            [id]
          )
        ).rows[0];
        if (!row) throw new HttpProblem(404, 'not_found', 'Patient not found.');
        await recordAccess(client, {
          clinicId: auth.clinicId,
          actorId: auth.userId,
          patientId: row.id,
          purpose: 'patient.view',
          requestId: request.id,
        });
        return toView(row, secrets);
      });
    }
  );

  app.post('/v1/patients', { preHandler: signedIn }, async (request, reply) => {
    const outcome = await bus.execute(
      {
        type: patientCreate.type,
        payload: request.body,
        idempotencyKey: idempotencyKey(request),
        source: 'gui',
      },
      actorFrom(request)
    );
    reply.status(201);
    return sendOutcome(reply, outcome);
  });

  app.patch('/v1/patients/:id', { preHandler: signedIn }, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    const body = typeof request.body === 'object' && request.body !== null ? request.body : {};
    return sendOutcome(
      reply,
      await bus.execute(
        {
          type: patientUpdate.type,
          payload: { ...body, patientId: id },
          idempotencyKey: idempotencyKey(request),
          source: 'gui',
        },
        actorFrom(request)
      )
    );
  });
}
