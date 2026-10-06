import {
  HISTORY_GROUP,
  HISTORY_KINDS,
  historyAdd,
  historyEnd,
  type PatientHistory,
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
import { HISTORY_COLUMNS, toEntry, type HistoryRow } from './commands.js';

/**
 * GET /v1/patients/:id/history, POST /v1/patients/:id/history/:kind and
 * POST /v1/patients/:id/history/:entryId/end. Reading needs patient.read and session.read, so
 * receptionists see no clinical content (ADR 0002). Every read is recorded.
 */

const patientParams = z.object({ id: z.string().uuid() });
const addParams = z.object({ id: z.string().uuid(), kind: z.enum(HISTORY_KINDS) });
const endParams = z.object({ id: z.string().uuid(), entryId: z.string().uuid() });
const historyQuery = z.object({ includeEnded: z.stringbool().default(false) });

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

const bodyOf = (body: unknown) => (typeof body === 'object' && body !== null ? body : {});

export async function registerHistoryRoutes(
  app: FastifyInstance,
  options: { pool: Pool; bus: CommandBus; tokens: TokenService }
) {
  const { pool, bus, tokens } = options;
  const signedIn = authenticate(tokens);

  app.get(
    '/v1/patients/:id/history',
    {
      preHandler: [signedIn, requirePermission('patient.read'), requirePermission('session.read')],
    },
    async (request): Promise<PatientHistory> => {
      const { id } = parse(patientParams, request.params);
      const { includeEnded } = parse(historyQuery, request.query);
      const auth = request.auth!;
      return withClinic(pool, auth.clinicId, async (client) => {
        const patient = await client.query('SELECT 1 FROM clinical.patients WHERE id = $1', [id]);
        if (!patient.rowCount) throw new HttpProblem(404, 'not_found', 'Patient not found.');
        await recordAccess(client, {
          clinicId: auth.clinicId,
          actorId: auth.userId,
          patientId: id,
          purpose: 'patient.history',
          requestId: request.id,
        });
        const { rows } = await client.query<HistoryRow>(
          `SELECT ${HISTORY_COLUMNS} FROM clinical.history_entries
           WHERE patient_id = $1 AND ($2 OR status = 'active')
           ORDER BY status, noted_at DESC`,
          [id, includeEnded]
        );
        const history: PatientHistory = {
          conditions: [],
          medications: [],
          allergies: [],
          riskFactors: [],
        };
        for (const row of rows) history[HISTORY_GROUP[row.kind]].push(toEntry(row));
        return history;
      });
    }
  );

  app.post('/v1/patients/:id/history/:kind', { preHandler: signedIn }, async (request, reply) => {
    const { id, kind } = parse(addParams, request.params);
    const outcome = await bus.execute(
      {
        type: historyAdd.type,
        payload: { ...bodyOf(request.body), patientId: id, kind },
        idempotencyKey: idempotencyKey(request),
        source: 'gui',
      },
      actorFrom(request)
    );
    reply.status(201);
    return sendOutcome(reply, outcome);
  });

  app.post(
    '/v1/patients/:id/history/:entryId/end',
    { preHandler: signedIn },
    async (request, reply) => {
      const { id, entryId } = parse(endParams, request.params);
      return sendOutcome(
        reply,
        await bus.execute(
          {
            type: historyEnd.type,
            payload: { ...bodyOf(request.body), patientId: id, entryId },
            idempotencyKey: idempotencyKey(request),
            source: 'gui',
          },
          actorFrom(request)
        )
      );
    }
  );
}
