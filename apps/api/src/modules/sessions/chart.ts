import { uuidv7 } from '@dental/db';
import type { PoolClient } from '../../platform/db.js';
import type { ChartEntryRow } from './model.js';

/**
 * The event-sourced tooth chart. chart_events is the record; chart_entries holds the latest
 * state per tooth and surface. Every event updates the projection in the same transaction, and
 * rebuildChart re-derives the projection from the events alone.
 */

export interface ChartPlace {
  tooth: string;
  /** Null for the whole tooth. */
  surface: string | null;
}

/** Appends an event for one place and applies it to the projection. */
export async function recordChartEvent(
  client: PoolClient,
  event: ChartPlace & {
    clinicId: string;
    patientId: string;
    sessionId: string;
    findingId: string;
    state: string | null;
  }
): Promise<void> {
  const { rows } = await client.query<{ recorded_at: Date }>(
    `INSERT INTO clinical.chart_events
       (id, clinic_id, patient_id, tooth, surface, state, finding_id, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING recorded_at`,
    [
      uuidv7(),
      event.clinicId,
      event.patientId,
      event.tooth,
      event.surface,
      event.state,
      event.findingId,
      event.sessionId,
    ]
  );
  const surfaceKey = event.surface ?? '';
  if (event.state === null) {
    await client.query(
      `DELETE FROM clinical.chart_entries WHERE patient_id = $1 AND tooth = $2 AND surface = $3`,
      [event.patientId, event.tooth, surfaceKey]
    );
    return;
  }
  await client.query(
    `INSERT INTO clinical.chart_entries
       (clinic_id, patient_id, tooth, surface, state, finding_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (patient_id, tooth, surface) DO UPDATE
     SET state = EXCLUDED.state, finding_id = EXCLUDED.finding_id, updated_at = EXCLUDED.updated_at`,
    [
      event.clinicId,
      event.patientId,
      event.tooth,
      surfaceKey,
      event.state,
      event.findingId,
      rows[0]!.recorded_at,
    ]
  );
}

/** The chart as the events say it is: the last event per place, unless it cleared the place. */
export async function chartFromEvents(
  client: PoolClient,
  patientId: string
): Promise<ChartEntryRow[]> {
  const { rows } = await client.query<ChartEntryRow & { state: string | null }>(
    `SELECT tooth, surface, state, finding_id, recorded_at AS updated_at
     FROM (
       SELECT DISTINCT ON (tooth, coalesce(surface, ''))
              tooth, coalesce(surface, '') AS surface, state, finding_id, recorded_at
       FROM clinical.chart_events
       WHERE patient_id = $1
       ORDER BY tooth, coalesce(surface, ''), seq DESC
     ) AS latest
     WHERE state IS NOT NULL
     ORDER BY tooth, surface`,
    [patientId]
  );
  return rows;
}

export async function readChart(client: PoolClient, patientId: string): Promise<ChartEntryRow[]> {
  const { rows } = await client.query<ChartEntryRow>(
    `SELECT tooth, surface, state, finding_id, updated_at FROM clinical.chart_entries
     WHERE patient_id = $1 ORDER BY tooth, surface`,
    [patientId]
  );
  return rows;
}

/** Replaces the patient's projection with one derived from the events alone. */
export async function rebuildChart(
  client: PoolClient,
  clinicId: string,
  patientId: string
): Promise<ChartEntryRow[]> {
  const derived = await chartFromEvents(client, patientId);
  await client.query('DELETE FROM clinical.chart_entries WHERE patient_id = $1', [patientId]);
  for (const entry of derived) {
    await client.query(
      `INSERT INTO clinical.chart_entries
         (clinic_id, patient_id, tooth, surface, state, finding_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        clinicId,
        patientId,
        entry.tooth,
        entry.surface,
        entry.state,
        entry.finding_id,
        entry.updated_at,
      ]
    );
  }
  return derived;
}
