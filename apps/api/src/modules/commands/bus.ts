import type { CommandDefinition, CommandSource, ErrorCode } from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import type { z } from 'zod';
import { withClinic, type Pool, type PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import { appendAudit, canonicalJson, sha256, type AuditChange } from '../audit/chain.js';

/**
 * The single write path (spec section E). A GUI form and a confirmed voice proposal both end
 * here: the bus checks the payload against the registry, checks the permission, then runs the
 * handler and writes the command row and the audit rows in one clinic-scoped transaction.
 *
 * Idempotency: (clinic, Idempotency-Key) is unique. A retry with the same key and the same
 * request returns the first result, including a refusal; with a different request it is
 * rejected. Unexpected (5xx) failures are not stored, so a retry can still succeed.
 */

export interface Actor {
  /** Null for the system actor, which runs platform commands from the operator CLI. */
  userId: string | null;
  clinicId: string;
  permissions: readonly string[];
  requestId?: string;
  ip?: string;
}

export interface HandlerContext {
  client: PoolClient;
  actor: Actor;
  commandId: string;
}

export interface HandlerOutcome<Result> {
  result: Result;
  /** The changes made, for the audit log. Empty when nothing changed. */
  audit: AuditChange[];
}

export type CommandHandler<Payload, Result> = (
  context: HandlerContext,
  payload: Payload
) => Promise<HandlerOutcome<Result>>;

export interface CommandRequest {
  type: string;
  payload: unknown;
  idempotencyKey: string;
  source: CommandSource;
}

export interface CommandOutcome {
  commandId: string;
  result: unknown;
  /** True when this is the stored result of an earlier request with the same key. */
  replayed: boolean;
}

interface Registered {
  definition: CommandDefinition;
  handler: CommandHandler<unknown, unknown>;
}

interface CommandRow {
  id: string;
  request_hash: string;
  status: string;
  result: unknown;
  error: {
    status: number;
    code: ErrorCode;
    title: string;
    extra?: Record<string, unknown>;
  } | null;
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const IDEMPOTENCY_CONSTRAINT = 'commands_idempotency_unique';

function isIdempotencyConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION &&
    'constraint' in error &&
    error.constraint === IDEMPOTENCY_CONSTRAINT
  );
}

export class CommandBus {
  private readonly handlers = new Map<string, Registered>();

  constructor(private readonly pool: Pool) {}

  register<Payload extends z.ZodType, Result>(
    definition: CommandDefinition<Payload>,
    handler: CommandHandler<z.infer<Payload>, Result>
  ): void {
    if (this.handlers.has(definition.type)) {
      throw new Error(`Command ${definition.type} is already registered.`);
    }
    this.handlers.set(definition.type, {
      definition,
      handler: handler as CommandHandler<unknown, unknown>,
    });
  }

  async execute(request: CommandRequest, actor: Actor): Promise<CommandOutcome> {
    const registered = this.handlers.get(request.type);
    if (!registered) {
      throw new HttpProblem(400, 'validation_failed', `Unknown command ${request.type}.`);
    }
    const { definition, handler } = registered;
    // Deny by default; row-level security is the independent second check.
    if (!actor.permissions.includes(definition.permission)) {
      throw new HttpProblem(403, 'forbidden', 'You do not have permission to do this.');
    }
    const parsed = definition.payload.safeParse(request.payload);
    if (!parsed.success) {
      throw new HttpProblem(400, 'validation_failed', 'The request is not valid.', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const payload = parsed.data;
    const requestHash = sha256(canonicalJson({ type: definition.type, payload }));

    const earlier = await this.find(actor.clinicId, request.idempotencyKey);
    if (earlier) return replay(earlier, requestHash);

    const commandId = uuidv7();
    const row = {
      id: commandId,
      clinicId: actor.clinicId,
      type: definition.type,
      payload,
      requestHash,
      source: request.source,
      actorId: actor.userId,
      risk: definition.risk,
      idempotencyKey: request.idempotencyKey,
      requestId: actor.requestId ?? null,
    };

    try {
      return await withClinic(this.pool, actor.clinicId, async (client) => {
        const outcome = await handler({ client, actor, commandId }, payload);
        // The answer is the stored jsonb, so the first response and a replay are identical.
        const result = await insertCommand(client, row, 'executed', outcome.result ?? null, null);
        await appendAudit(
          client,
          {
            clinicId: actor.clinicId,
            actorId: actor.userId,
            commandId,
            requestId: actor.requestId ?? null,
            ip: actor.ip ?? null,
          },
          outcome.audit
        );
        return { commandId, result, replayed: false };
      });
    } catch (error) {
      // A concurrent request with the same key committed first.
      if (isIdempotencyConflict(error)) {
        const winner = await this.find(actor.clinicId, request.idempotencyKey);
        if (winner) return replay(winner, requestHash);
      }
      if (error instanceof HttpProblem && error.statusCode < 500) {
        const stored = await this.recordRefusal(row, error, requestHash);
        if (stored) return stored;
      }
      throw error;
    }
  }

  /**
   * Stores a refused command so a retry with the same key gets the same answer. Returns the
   * stored outcome instead when a concurrent request with the same key succeeded first.
   */
  private async recordRefusal(
    row: Parameters<typeof insertCommand>[1],
    error: HttpProblem,
    requestHash: string
  ): Promise<CommandOutcome | undefined> {
    try {
      await withClinic(this.pool, row.clinicId, (client) =>
        insertCommand(client, row, 'failed', null, {
          status: error.statusCode,
          code: error.code,
          title: error.title,
          extra: error.extra,
        })
      );
    } catch (insertError) {
      // A refused onboarding has no clinic to store the refusal under; the answer stands.
      if (
        typeof insertError === 'object' &&
        insertError !== null &&
        'code' in insertError &&
        insertError.code === FOREIGN_KEY_VIOLATION
      ) {
        return undefined;
      }
      // A concurrent request with the same key was stored first; its answer stands.
      if (!isIdempotencyConflict(insertError)) throw insertError;
      const winner = await this.find(row.clinicId, row.idempotencyKey);
      if (winner) return replay(winner, requestHash);
    }
    return undefined;
  }

  private async find(clinicId: string, idempotencyKey: string): Promise<CommandRow | undefined> {
    return withClinic(this.pool, clinicId, async (client) => {
      const { rows } = await client.query<CommandRow>(
        `SELECT id, request_hash, status, result, error FROM voice.commands
         WHERE clinic_id = $1 AND idempotency_key = $2`,
        [clinicId, idempotencyKey]
      );
      return rows[0];
    });
  }
}

function replay(row: CommandRow, requestHash: string): CommandOutcome {
  if (row.request_hash !== requestHash) {
    throw new HttpProblem(
      422,
      'idempotency_key_reused',
      'This Idempotency-Key was already used for a different request.'
    );
  }
  if (row.status === 'failed' && row.error) {
    throw new HttpProblem(row.error.status, row.error.code, row.error.title, row.error.extra);
  }
  return { commandId: row.id, result: row.result, replayed: true };
}

async function insertCommand(
  client: PoolClient,
  row: {
    id: string;
    clinicId: string;
    type: string;
    payload: unknown;
    requestHash: string;
    source: CommandSource;
    actorId: string | null;
    risk: string;
    idempotencyKey: string;
    requestId: string | null;
  },
  status: 'executed' | 'failed',
  result: unknown,
  error: unknown
): Promise<unknown> {
  const { rows } = await client.query<{ result: unknown }>(
    `INSERT INTO voice.commands
       (id, clinic_id, type, payload, request_hash, source, actor_id, risk_tier, status,
        idempotency_key, result, error, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING result`,
    [
      row.id,
      row.clinicId,
      row.type,
      JSON.stringify(row.payload),
      row.requestHash,
      row.source,
      row.actorId,
      row.risk,
      status,
      row.idempotencyKey,
      result === null ? null : JSON.stringify(result),
      error === null ? null : JSON.stringify(error),
      row.requestId,
    ]
  );
  return rows[0]?.result ?? null;
}
