import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../platform/auth.js';
import { withClinic, type Pool } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { TokenService } from '../identity/tokens.js';
import { recordAccess } from './chain.js';

/**
 * GET /v1/audit: the clinic's audit trail, newest first, with cursor pagination on the
 * sequence number. Reading the audit trail is itself recorded (spec section G).
 */

const query = z.object({
  entity: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

interface Row {
  seq: string;
  at: Date;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  command_id: string | null;
  hash: string;
}

export async function registerAuditRoutes(
  app: FastifyInstance,
  options: { pool: Pool; tokens: TokenService }
) {
  app.get(
    '/v1/audit',
    { preHandler: [authenticate(options.tokens), requirePermission('audit.read')] },
    async (request) => {
      const parsed = query.safeParse(request.query);
      if (!parsed.success) {
        throw new HttpProblem(400, 'validation_failed', 'The request is not valid.');
      }
      const { entity, entityId, before, limit } = parsed.data;
      const auth = request.auth!;
      return withClinic(options.pool, auth.clinicId, async (client) => {
        await recordAccess(client, {
          clinicId: auth.clinicId,
          actorId: auth.userId,
          purpose: 'audit.read',
          requestId: request.id,
        });
        const { rows } = await client.query<Row>(
          `SELECT seq, at, actor_id, action, entity, entity_id, before, after, command_id, hash
           FROM audit.audit_log
           WHERE ($1::text IS NULL OR entity = $1)
             AND ($2::text IS NULL OR entity_id = $2)
             AND ($3::bigint IS NULL OR seq < $3)
           ORDER BY seq DESC
           LIMIT $4`,
          [entity ?? null, entityId ?? null, before ?? null, limit + 1]
        );
        const page = rows.slice(0, limit);
        return {
          entries: page.map((row) => ({
            seq: Number(row.seq),
            at: row.at.toISOString(),
            actorId: row.actor_id,
            action: row.action,
            entity: row.entity,
            entityId: row.entity_id,
            before: row.before,
            after: row.after,
            commandId: row.command_id,
            hash: row.hash,
          })),
          nextBefore: rows.length > limit ? Number(page.at(-1)!.seq) : null,
        };
      });
    }
  );
}
