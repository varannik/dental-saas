import {
  diagnosisConfirm,
  diagnosisRecord,
  diagnosisReject,
  diagnosisRetract,
  diagnosisSuggest,
  type Diagnosis,
  type DiagnosisAdd,
  type DiagnosisDecision,
  type DiagnosisStatus,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import type { PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { CommandBus, HandlerContext, HandlerOutcome } from '../commands/bus.js';
import { openSession } from '../sessions/model.js';

/**
 * Diagnoses (C4). Assistants suggest; dentists record, confirm, reject and retract. Every
 * command carries its own permission, so the bus refuses an assistant's confirmation before
 * any handler runs (spec section I).
 */

export interface DiagnosisRow {
  id: string;
  session_id: string;
  patient_id: string;
  tooth: string | null;
  code: Diagnosis['code'];
  label: string | null;
  certainty: Diagnosis['certainty'];
  status: DiagnosisStatus;
  suggested_by: string | null;
  suggested_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  reason: string | null;
}

export const DIAGNOSIS_COLUMNS = `id, session_id, patient_id, tooth, code, label, certainty, status,
  suggested_by, suggested_at, decided_by, decided_at, reason`;

export function toDiagnosis(row: DiagnosisRow): Diagnosis {
  return {
    id: row.id,
    sessionId: row.session_id,
    patientId: row.patient_id,
    tooth: row.tooth,
    code: row.code,
    label: row.label,
    certainty: row.certainty,
    status: row.status,
    suggestedBy: row.suggested_by,
    suggestedAt: row.suggested_at.toISOString(),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    reason: row.reason,
  };
}

function adder(status: 'suggested' | 'confirmed', type: string) {
  return async function add(
    { client, actor }: HandlerContext,
    payload: DiagnosisAdd
  ): Promise<HandlerOutcome<Diagnosis>> {
    const session = await openSession(client, payload.sessionId);
    const confirmed = status === 'confirmed';
    const row = (
      await client.query<DiagnosisRow>(
        `INSERT INTO clinical.diagnoses
           (id, clinic_id, session_id, patient_id, tooth, code, label, certainty, status,
            suggested_by, decided_by, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $12 THEN now() END)
         RETURNING ${DIAGNOSIS_COLUMNS}`,
        [
          uuidv7(),
          actor.clinicId,
          session.id,
          session.patient_id,
          payload.tooth ?? null,
          payload.code,
          payload.label ?? null,
          payload.certainty ?? null,
          status,
          actor.userId,
          confirmed ? actor.userId : null,
          confirmed,
        ]
      )
    ).rows[0]!;
    return {
      result: toDiagnosis(row),
      audit: [
        {
          action: type,
          entity: 'diagnosis',
          entityId: row.id,
          before: null,
          after: {
            sessionId: session.id,
            patientId: session.patient_id,
            tooth: row.tooth ?? undefined,
            code: row.code,
            label: row.label ?? undefined,
            certainty: row.certainty ?? undefined,
            status: row.status,
          },
        },
      ],
    };
  };
}

/** A diagnosis in an open session, locked for the decision. */
async function decidable(client: PoolClient, diagnosisId: string): Promise<DiagnosisRow> {
  const row = (
    await client.query<DiagnosisRow>(
      `SELECT ${DIAGNOSIS_COLUMNS} FROM clinical.diagnoses WHERE id = $1 FOR UPDATE`,
      [diagnosisId]
    )
  ).rows[0];
  if (!row) throw new HttpProblem(404, 'not_found', 'Diagnosis not found.');
  await openSession(client, row.session_id);
  return row;
}

function decider(from: DiagnosisStatus, to: DiagnosisStatus, type: string) {
  return async function decide(
    { client, actor }: HandlerContext,
    payload: DiagnosisDecision
  ): Promise<HandlerOutcome<Diagnosis>> {
    const current = await decidable(client, payload.diagnosisId);
    if (current.status !== from) {
      throw new HttpProblem(
        422,
        'domain_rule_violated',
        `Only a ${from} diagnosis can be ${to}; this one is ${current.status}.`
      );
    }
    const row = (
      await client.query<DiagnosisRow>(
        `UPDATE clinical.diagnoses
         SET status = $2, decided_by = $3, decided_at = now(), reason = $4
         WHERE id = $1
         RETURNING ${DIAGNOSIS_COLUMNS}`,
        [current.id, to, actor.userId, payload.reason ?? null]
      )
    ).rows[0]!;
    return {
      result: toDiagnosis(row),
      audit: [
        {
          action: type,
          entity: 'diagnosis',
          entityId: row.id,
          before: { status: from },
          after: { status: to, reason: payload.reason },
        },
      ],
    };
  };
}

export function registerDiagnosisCommands(bus: CommandBus) {
  bus.register(diagnosisSuggest, adder('suggested', diagnosisSuggest.type));
  bus.register(diagnosisRecord, adder('confirmed', diagnosisRecord.type));
  bus.register(diagnosisConfirm, decider('suggested', 'confirmed', diagnosisConfirm.type));
  bus.register(diagnosisReject, decider('suggested', 'rejected', diagnosisReject.type));
  bus.register(diagnosisRetract, decider('confirmed', 'retracted', diagnosisRetract.type));
}
