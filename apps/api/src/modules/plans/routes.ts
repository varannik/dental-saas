import {
  planAccept,
  planCancel,
  planCreate,
  planItemAdd,
  planItemCancel,
  planReorder,
} from '@dental/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../platform/auth.js';
import { withClinic, type Pool } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import { recordAccess } from '../audit/chain.js';
import type { CommandBus } from '../commands/bus.js';
import { actorFrom, idempotencyKey, sendOutcome } from '../commands/http.js';
import type { TokenService } from '../identity/tokens.js';
import {
  loadPlan,
  PLAN_COLUMNS,
  toProcedureType,
  type PlanRow,
  type ProcedureRow,
} from './model.js';

/**
 * GET  /v1/procedure-types          the catalog, for any signed-in user
 * GET  /v1/patients/:id/plans       plans with items, newest first (clinical read)
 * POST /v1/patients/:id/plans       plan.create
 * POST /v1/plans/:id/items          plan_item.add
 * POST /v1/plans/:id/items/:itemId/cancel
 * POST /v1/plans/:id/reorder        plan.reorder
 * POST /v1/plans/:id/accept | /cancel
 */

const idParams = z.object({ id: z.string().uuid() });
const itemParams = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });

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

export async function registerPlanRoutes(
  app: FastifyInstance,
  options: { pool: Pool; bus: CommandBus; tokens: TokenService }
) {
  const { pool, bus, tokens } = options;
  const signedIn = authenticate(tokens);

  const command =
    (
      type: string,
      status: number,
      payloadOf: (request: FastifyRequest) => Record<string, unknown>
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const outcome = await bus.execute(
        {
          type,
          payload: payloadOf(request),
          idempotencyKey: idempotencyKey(request),
          source: 'gui',
        },
        actorFrom(request)
      );
      reply.status(status);
      return sendOutcome(reply, outcome);
    };

  app.get('/v1/procedure-types', { preHandler: signedIn }, async (request) => {
    const auth = request.auth!;
    return withClinic(pool, auth.clinicId, async (client) => {
      const { rows } = await client.query<ProcedureRow>(
        `SELECT id, code, name, category, scope, allows_missing_tooth, aliases, external_code
         FROM catalog.procedure_types WHERE active ORDER BY category, name`
      );
      return { procedureTypes: rows.map(toProcedureType) };
    });
  });

  app.get(
    '/v1/patients/:id/plans',
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
          purpose: 'patient.plans',
          requestId: request.id,
        });
        const plans = await client.query<PlanRow>(
          `SELECT ${PLAN_COLUMNS} FROM clinical.treatment_plans
           WHERE patient_id = $1 ORDER BY created_at DESC, id DESC`,
          [id]
        );
        const result = [];
        for (const plan of plans.rows) result.push(await loadPlan(client, plan));
        return { plans: result };
      });
    }
  );

  app.post(
    '/v1/patients/:id/plans',
    { preHandler: signedIn },
    command(planCreate.type, 201, (request) => ({
      ...bodyOf(request.body),
      patientId: parse(idParams, request.params).id,
    }))
  );
  app.post(
    '/v1/plans/:id/items',
    { preHandler: signedIn },
    command(planItemAdd.type, 201, (request) => ({
      ...bodyOf(request.body),
      planId: parse(idParams, request.params).id,
    }))
  );
  app.post(
    '/v1/plans/:id/items/:itemId/cancel',
    { preHandler: signedIn },
    command(planItemCancel.type, 200, (request) => ({
      ...bodyOf(request.body),
      itemId: parse(itemParams, request.params).itemId,
    }))
  );
  app.post(
    '/v1/plans/:id/reorder',
    { preHandler: signedIn },
    command(planReorder.type, 200, (request) => ({
      ...bodyOf(request.body),
      planId: parse(idParams, request.params).id,
    }))
  );
  app.post(
    '/v1/plans/:id/accept',
    { preHandler: signedIn },
    command(planAccept.type, 200, (request) => ({
      ...bodyOf(request.body),
      planId: parse(idParams, request.params).id,
    }))
  );
  app.post(
    '/v1/plans/:id/cancel',
    { preHandler: signedIn },
    command(planCancel.type, 200, (request) => ({
      ...bodyOf(request.body),
      planId: parse(idParams, request.params).id,
    }))
  );
}
