import {
  historyAdd,
  historyEnd,
  type HistoryAdd,
  type HistoryEnd,
  type HistoryEntry,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import type { PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { CommandBus, HandlerContext, HandlerOutcome } from '../commands/bus.js';

/**
 * history.add and history.end (C2). Entries are never edited: a change is an end plus a new
 * entry, so the record always shows what was known when (ADR 0002).
 */

export interface HistoryRow {
  id: string;
  kind: HistoryEntry['kind'];
  label: string;
  code: string | null;
  detail: string | null;
  severity: HistoryEntry['severity'];
  onset_date: string | null;
  status: HistoryEntry['status'];
  noted_at: Date;
  noted_by: string | null;
  ended_at: Date | null;
  ended_by: string | null;
  end_reason: HistoryEntry['endReason'];
  end_note: string | null;
}

export const HISTORY_COLUMNS = `id, kind, label, code, detail, severity, onset_date, status,
  noted_at, noted_by, ended_at, ended_by, end_reason, end_note`;

export function toEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    code: row.code,
    detail: row.detail,
    severity: row.severity,
    onsetDate: row.onset_date,
    status: row.status,
    notedAt: row.noted_at.toISOString(),
    notedBy: row.noted_by,
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    endedBy: row.ended_by,
    endReason: row.end_reason,
    endNote: row.end_note,
  };
}

/** The patient, locked against concurrent archiving; archived patients take no new entries. */
async function activePatient(client: PoolClient, patientId: string) {
  const patient = (
    await client.query<{ status: string }>(
      'SELECT status FROM clinical.patients WHERE id = $1 FOR SHARE',
      [patientId]
    )
  ).rows[0];
  if (!patient) throw new HttpProblem(404, 'not_found', 'Patient not found.');
  if (patient.status !== 'active') {
    throw new HttpProblem(
      422,
      'domain_rule_violated',
      'The patient is archived. Restore them first.'
    );
  }
}

export async function addHistoryEntry(
  { client, actor }: HandlerContext,
  payload: HistoryAdd
): Promise<HandlerOutcome<HistoryEntry>> {
  await activePatient(client, payload.patientId);

  const same = (
    await client.query<{ id: string; label: string }>(
      `SELECT id, label FROM clinical.history_entries
       WHERE patient_id = $1 AND kind = $2 AND status = 'active' AND lower(label) = lower($3)`,
      [payload.patientId, payload.kind, payload.label]
    )
  ).rows;
  if (same.length > 0) {
    throw new HttpProblem(409, 'possible_duplicate', 'This is already recorded as active.', {
      candidates: same,
    });
  }

  const row = (
    await client.query<HistoryRow>(
      `INSERT INTO clinical.history_entries
         (id, clinic_id, patient_id, kind, label, code, detail, severity, onset_date, noted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${HISTORY_COLUMNS}`,
      [
        uuidv7(),
        actor.clinicId,
        payload.patientId,
        payload.kind,
        payload.label,
        payload.code ?? null,
        payload.detail ?? null,
        payload.severity ?? null,
        payload.onsetDate ?? null,
        actor.userId,
      ]
    )
  ).rows[0]!;
  const entry = toEntry(row);

  return {
    result: entry,
    audit: [
      {
        action: historyAdd.type,
        entity: 'history_entry',
        entityId: row.id,
        before: null,
        after: {
          patientId: payload.patientId,
          kind: entry.kind,
          label: entry.label,
          code: entry.code ?? undefined,
          detail: entry.detail ?? undefined,
          severity: entry.severity ?? undefined,
          onsetDate: entry.onsetDate ?? undefined,
        },
      },
    ],
  };
}

export async function endHistoryEntry(
  { client, actor }: HandlerContext,
  payload: HistoryEnd
): Promise<HandlerOutcome<HistoryEntry>> {
  const current = (
    await client.query<HistoryRow>(
      `SELECT ${HISTORY_COLUMNS} FROM clinical.history_entries
       WHERE id = $1 AND patient_id = $2 FOR UPDATE`,
      [payload.entryId, payload.patientId]
    )
  ).rows[0];
  if (!current) throw new HttpProblem(404, 'not_found', 'History entry not found.');
  if (current.status !== 'active') {
    throw new HttpProblem(422, 'domain_rule_violated', 'This entry has already ended.');
  }

  const row = (
    await client.query<HistoryRow>(
      `UPDATE clinical.history_entries
       SET status = 'ended', ended_at = now(), ended_by = $2, end_reason = $3, end_note = $4
       WHERE id = $1
       RETURNING ${HISTORY_COLUMNS}`,
      [current.id, actor.userId, payload.reason, payload.note ?? null]
    )
  ).rows[0]!;

  return {
    result: toEntry(row),
    audit: [
      {
        action: historyEnd.type,
        entity: 'history_entry',
        entityId: row.id,
        before: { status: 'active' },
        after: { status: 'ended', reason: payload.reason, note: payload.note },
      },
    ],
  };
}

export function registerHistoryCommands(bus: CommandBus) {
  bus.register(historyAdd, addHistoryEntry);
  bus.register(historyEnd, endHistoryEntry);
}
