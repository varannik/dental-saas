import { createHash } from 'node:crypto';
import { uuidv7 } from '@dental/db';
import type { PoolClient } from '../../platform/db.js';

/**
 * The hash-chained audit log (spec section F). Each clinic has one chain: every entry's hash
 * covers its content and the previous entry's hash, so changing or removing any entry breaks
 * every later link. Entries are appended inside the transaction of the change they record.
 */

export const GENESIS_HASH = '0'.repeat(64);

/** One change made by a command, as the handler reports it. */
export interface AuditChange {
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

export interface AuditContext {
  clinicId: string;
  actorId: string | null;
  commandId: string | null;
  requestId: string | null;
  ip: string | null;
}

interface HashedFields {
  clinicId: string;
  seq: number;
  at: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  commandId: string | null;
  requestId: string | null;
  ip: string | null;
  prevHash: string;
}

/** JSON with object keys sorted at every level, so equal values always serialise the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function entryHash(fields: HashedFields): string {
  return sha256(canonicalJson(fields));
}

/** Plain JSON, as PostgreSQL will return it: dates become strings, undefined disappears. */
function toJson(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

/**
 * Appends entries to the clinic's chain. Must run inside the transaction of the change, with
 * the clinic set for row-level security. Locks the chain head until the transaction ends.
 */
export async function appendAudit(
  client: PoolClient,
  context: AuditContext,
  changes: AuditChange[]
): Promise<void> {
  if (changes.length === 0) return;
  await client.query(
    `INSERT INTO audit.chain_heads (clinic_id, last_seq, last_hash) VALUES ($1, 0, $2)
     ON CONFLICT (clinic_id) DO NOTHING`,
    [context.clinicId, GENESIS_HASH]
  );
  const head = (
    await client.query<{ last_seq: string; last_hash: string }>(
      'SELECT last_seq, last_hash FROM audit.chain_heads WHERE clinic_id = $1 FOR UPDATE',
      [context.clinicId]
    )
  ).rows[0]!;

  let seq = Number(head.last_seq);
  let prevHash = head.last_hash;
  for (const change of changes) {
    seq += 1;
    const fields: HashedFields = {
      clinicId: context.clinicId,
      seq,
      at: new Date().toISOString(),
      actorId: context.actorId,
      action: change.action,
      entity: change.entity,
      entityId: change.entityId,
      before: toJson(change.before),
      after: toJson(change.after),
      commandId: context.commandId,
      requestId: context.requestId,
      ip: context.ip,
      prevHash,
    };
    const hash = entryHash(fields);
    await client.query(
      `INSERT INTO audit.audit_log
         (id, clinic_id, seq, at, actor_id, action, entity, entity_id, before, after,
          command_id, request_id, ip, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        uuidv7(),
        fields.clinicId,
        seq,
        fields.at,
        fields.actorId,
        fields.action,
        fields.entity,
        fields.entityId,
        JSON.stringify(fields.before),
        JSON.stringify(fields.after),
        fields.commandId,
        fields.requestId,
        fields.ip,
        prevHash,
        hash,
      ]
    );
    prevHash = hash;
  }
  await client.query(
    'UPDATE audit.chain_heads SET last_seq = $2, last_hash = $3 WHERE clinic_id = $1',
    [context.clinicId, seq, prevHash]
  );
}

export interface ChainReport {
  clinicId: string;
  ok: boolean;
  checked: number;
  /** The first entry that fails, and why. */
  brokenAt?: number;
  reason?: string;
}

interface AuditRow {
  seq: string;
  at: Date;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  command_id: string | null;
  request_id: string | null;
  ip: string | null;
  prev_hash: string;
  hash: string;
}

/** Recomputes the clinic's whole chain and compares it with the stored hashes and the head. */
export async function verifyChain(client: PoolClient, clinicId: string): Promise<ChainReport> {
  const { rows } = await client.query<AuditRow>(
    `SELECT seq, at, actor_id, action, entity, entity_id, before, after, command_id,
            request_id, ip, prev_hash, hash
     FROM audit.audit_log WHERE clinic_id = $1 ORDER BY seq`,
    [clinicId]
  );
  const fail = (seq: number, reason: string, checked: number): ChainReport => ({
    clinicId,
    ok: false,
    checked,
    brokenAt: seq,
    reason,
  });

  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  for (const [index, row] of rows.entries()) {
    const seq = Number(row.seq);
    if (seq !== expectedSeq) return fail(expectedSeq, `entry ${expectedSeq} is missing`, index);
    if (row.prev_hash !== prevHash) return fail(seq, 'link to the previous entry is broken', index);
    const hash = entryHash({
      clinicId,
      seq,
      at: row.at.toISOString(),
      actorId: row.actor_id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      before: row.before,
      after: row.after,
      commandId: row.command_id,
      requestId: row.request_id,
      ip: row.ip,
      prevHash,
    });
    if (hash !== row.hash) return fail(seq, 'content does not match its hash', index);
    prevHash = row.hash;
    expectedSeq += 1;
  }

  const head = (
    await client.query<{ last_seq: string; last_hash: string }>(
      'SELECT last_seq, last_hash FROM audit.chain_heads WHERE clinic_id = $1',
      [clinicId]
    )
  ).rows[0];
  const headSeq = head ? Number(head.last_seq) : 0;
  if (headSeq !== rows.length || (head?.last_hash ?? GENESIS_HASH) !== prevHash) {
    return fail(rows.length + 1, 'the chain head does not match the last entry', rows.length);
  }
  return { clinicId, ok: true, checked: rows.length };
}

/** Records a read that must be traceable, such as opening a patient or reading the audit log. */
export async function recordAccess(
  client: PoolClient,
  access: {
    clinicId: string;
    actorId: string;
    purpose: string;
    patientId?: string;
    requestId?: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO audit.access_log (id, clinic_id, actor_id, patient_id, purpose, request_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      uuidv7(),
      access.clinicId,
      access.actorId,
      access.patientId ?? null,
      access.purpose,
      access.requestId ?? null,
    ]
  );
}
