import {
  FINDINGS,
  findingAdd,
  noteAdd,
  perioRecord,
  sessionComplete,
  sessionStart,
  surfacesOf,
  type ChartEntry,
  type ClinicalNote,
  type ClinicalSession,
  type Finding,
  type FindingAdd,
  type NoteAdd,
  type PerioRecord,
  type SessionComplete,
  type SessionStart,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import { HttpProblem } from '../../platform/http-problem.js';
import type { AuditChange } from '../audit/chain.js';
import type { CommandBus, HandlerContext, HandlerOutcome } from '../commands/bus.js';
import { readChart, recordChartEvent } from './chart.js';
import {
  FINDING_COLUMNS,
  NOTE_COLUMNS,
  openSession,
  SESSION_COLUMNS,
  toChartEntry,
  toFinding,
  toNote,
  toSession,
  type FindingRow,
  type NoteRow,
  type SessionRow,
} from './model.js';

/**
 * Session commands (C3): start and complete a session, and record findings, periodontal
 * readings and notes in an open session. Findings drive the event-sourced chart.
 */

const UNIQUE_VIOLATION = '23505';

export async function startSession(
  { client, actor }: HandlerContext,
  payload: SessionStart
): Promise<HandlerOutcome<ClinicalSession>> {
  const patient = (
    await client.query<{ status: string }>(
      'SELECT status FROM clinical.patients WHERE id = $1 FOR SHARE',
      [payload.patientId]
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

  const open = (
    await client.query<{ id: string }>(
      `SELECT id FROM clinical.clinical_sessions WHERE patient_id = $1 AND status = 'open'`,
      [payload.patientId]
    )
  ).rows[0];
  const alreadyOpen = (sessionId: string) =>
    new HttpProblem(409, 'session_open', 'This patient already has an open session.', {
      sessionId,
    });
  if (open) throw alreadyOpen(open.id);

  let row: SessionRow;
  try {
    row = (
      await client.query<SessionRow>(
        `INSERT INTO clinical.clinical_sessions (id, clinic_id, patient_id, provider_id, chief_complaint)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${SESSION_COLUMNS}`,
        [uuidv7(), actor.clinicId, payload.patientId, actor.userId, payload.chiefComplaint ?? null]
      )
    ).rows[0]!;
  } catch (error) {
    // Another session was opened at the same moment.
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw alreadyOpen('');
    throw error;
  }

  return {
    result: toSession(row),
    audit: [
      {
        action: sessionStart.type,
        entity: 'session',
        entityId: row.id,
        before: null,
        after: { patientId: row.patient_id, chiefComplaint: row.chief_complaint ?? undefined },
      },
    ],
  };
}

export async function completeSession(
  { client }: HandlerContext,
  payload: SessionComplete
): Promise<HandlerOutcome<ClinicalSession>> {
  await openSession(client, payload.sessionId);
  const running = await client.query(
    `SELECT 1 FROM clinical.procedures WHERE session_id = $1 AND status = 'in_progress'`,
    [payload.sessionId]
  );
  if (running.rowCount) {
    throw new HttpProblem(
      422,
      'domain_rule_violated',
      'A procedure is still in progress. Complete or cancel it first.'
    );
  }
  const row = (
    await client.query<SessionRow>(
      `UPDATE clinical.clinical_sessions SET status = 'completed', ended_at = now()
       WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
      [payload.sessionId]
    )
  ).rows[0]!;
  return {
    result: toSession(row),
    audit: [
      {
        action: sessionComplete.type,
        entity: 'session',
        entityId: row.id,
        before: { status: 'open' },
        after: { status: 'completed', endedAt: row.ended_at?.toISOString() },
      },
    ],
  };
}

export interface FindingResult {
  findings: Finding[];
  /** The chart of the tooth after the finding. */
  chart: ChartEntry[];
}

export async function addFinding(
  { client, actor, amendmentId }: HandlerContext,
  payload: FindingAdd
): Promise<HandlerOutcome<FindingResult>> {
  const session = await openSession(client, payload.sessionId, amendmentId);

  if (payload.supersedesId) {
    const earlier = (
      await client.query<{ tooth: string }>(
        'SELECT tooth FROM clinical.findings WHERE id = $1 AND patient_id = $2',
        [payload.supersedesId, session.patient_id]
      )
    ).rows[0];
    if (!earlier || earlier.tooth !== payload.tooth) {
      throw new HttpProblem(
        422,
        'domain_rule_violated',
        'A correction must refer to an earlier finding on the same tooth of this patient.'
      );
    }
  }

  const { state } = FINDINGS[payload.code];
  const surfaces: (string | null)[] = payload.surfaces ?? [null];
  const findings: Finding[] = [];
  const audit: AuditChange[] = [];

  for (const surface of surfaces) {
    const row = (
      await client.query<FindingRow>(
        `INSERT INTO clinical.findings
           (id, clinic_id, session_id, patient_id, tooth, surface, code, value, note,
            supersedes_id, recorded_by, amendment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING ${FINDING_COLUMNS}`,
        [
          uuidv7(),
          actor.clinicId,
          session.id,
          session.patient_id,
          payload.tooth,
          surface,
          payload.code,
          payload.value ?? null,
          payload.note ?? null,
          payload.supersedesId ?? null,
          actor.userId,
          amendmentId ?? null,
        ]
      )
    ).rows[0]!;
    findings.push(toFinding(row));

    // A whole-tooth "sound" clears the tooth and every surface on it.
    const places =
      surface === null && state === null ? [null, ...surfacesOf(payload.tooth)] : [surface];
    for (const place of places) {
      await recordChartEvent(client, {
        clinicId: actor.clinicId,
        patientId: session.patient_id,
        sessionId: session.id,
        findingId: row.id,
        tooth: payload.tooth,
        surface: place,
        state,
      });
    }

    audit.push({
      action: findingAdd.type,
      entity: 'finding',
      entityId: row.id,
      before: null,
      after: {
        sessionId: session.id,
        patientId: session.patient_id,
        tooth: row.tooth,
        surface: row.surface ?? undefined,
        code: row.code,
        value: row.value ?? undefined,
        supersedesId: row.supersedes_id ?? undefined,
      },
    });
  }

  const chart = (await readChart(client, session.patient_id))
    .filter((entry) => entry.tooth === payload.tooth)
    .map(toChartEntry);
  return { result: { findings, chart }, audit };
}

export async function recordPerio(
  { client, actor }: HandlerContext,
  payload: PerioRecord
): Promise<HandlerOutcome<{ recorded: number }>> {
  const session = await openSession(client, payload.sessionId);
  const places = payload.measurements.map((m) => `${m.tooth}:${m.site}`);
  if (new Set(places).size !== places.length) {
    throw new HttpProblem(400, 'validation_failed', 'Each tooth and site may appear once.', {
      issues: [{ path: 'measurements', message: 'Each tooth and site may appear once.' }],
    });
  }

  for (const measurement of payload.measurements) {
    await client.query(
      `INSERT INTO clinical.perio_measurements
         (id, clinic_id, session_id, patient_id, tooth, site, pocket_depth, bleeding, recession,
          recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uuidv7(),
        actor.clinicId,
        session.id,
        session.patient_id,
        measurement.tooth,
        measurement.site,
        measurement.pocketDepth,
        measurement.bleeding,
        measurement.recession ?? null,
        actor.userId,
      ]
    );
  }

  const deepest = Math.max(...payload.measurements.map((m) => m.pocketDepth));
  return {
    result: { recorded: payload.measurements.length },
    audit: [
      {
        action: perioRecord.type,
        entity: 'session',
        entityId: session.id,
        before: null,
        after: {
          patientId: session.patient_id,
          sites: payload.measurements.length,
          teeth: [...new Set(payload.measurements.map((m) => m.tooth))].sort(),
          deepestPocket: deepest,
          bleedingSites: payload.measurements.filter((m) => m.bleeding).length,
        },
      },
    ],
  };
}

export async function addNote(
  { client, actor, amendmentId }: HandlerContext,
  payload: NoteAdd
): Promise<HandlerOutcome<ClinicalNote>> {
  const session = await openSession(client, payload.sessionId, amendmentId);
  const row = (
    await client.query<NoteRow>(
      `INSERT INTO clinical.clinical_notes
         (id, clinic_id, session_id, type, body, recorded_by, amendment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${NOTE_COLUMNS}`,
      [
        uuidv7(),
        actor.clinicId,
        session.id,
        payload.type,
        payload.body,
        actor.userId,
        amendmentId ?? null,
      ]
    )
  ).rows[0]!;
  return {
    result: toNote(row),
    audit: [
      {
        action: noteAdd.type,
        entity: 'note',
        entityId: row.id,
        before: null,
        after: { sessionId: session.id, type: row.type, length: row.body.length },
      },
    ],
  };
}

export function registerSessionCommands(bus: CommandBus) {
  bus.register(sessionStart, startSession);
  bus.register(sessionComplete, completeSession);
  bus.register(findingAdd, addFinding);
  bus.register(perioRecord, recordPerio);
  bus.register(noteAdd, addNote);
}
