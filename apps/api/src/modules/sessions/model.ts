import type {
  ChartEntry,
  ChartEvent,
  ClinicalNote,
  ClinicalSession,
  Finding,
  FindingCode,
  NoteType,
  PerioMeasurement,
  PerioSite,
  SessionStatus,
  Surface,
} from '@dental/contracts';
import type { PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';

/** Rows of the session tables and the API shapes they map to. */

export interface SessionRow {
  id: string;
  patient_id: string;
  provider_id: string | null;
  status: SessionStatus;
  chief_complaint: string | null;
  started_at: Date;
  ended_at: Date | null;
}

export const SESSION_COLUMNS =
  'id, patient_id, provider_id, status, chief_complaint, started_at, ended_at';

export function toSession(row: SessionRow): ClinicalSession {
  return {
    id: row.id,
    patientId: row.patient_id,
    providerId: row.provider_id,
    status: row.status,
    chiefComplaint: row.chief_complaint,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
  };
}

export interface FindingRow {
  id: string;
  session_id: string;
  tooth: string;
  surface: Surface | null;
  code: FindingCode;
  value: string | null;
  note: string | null;
  supersedes_id: string | null;
  recorded_at: Date;
  recorded_by: string | null;
}

export const FINDING_COLUMNS =
  'id, session_id, tooth, surface, code, value, note, supersedes_id, recorded_at, recorded_by';

export function toFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    sessionId: row.session_id,
    tooth: row.tooth,
    surface: row.surface,
    code: row.code,
    value: row.value,
    note: row.note,
    supersedesId: row.supersedes_id,
    recordedAt: row.recorded_at.toISOString(),
    recordedBy: row.recorded_by,
  };
}

export interface ChartEntryRow {
  tooth: string;
  surface: string;
  state: string;
  finding_id: string;
  updated_at: Date;
}

export function toChartEntry(row: ChartEntryRow): ChartEntry {
  return {
    tooth: row.tooth,
    surface: row.surface === '' ? null : (row.surface as Surface),
    state: row.state,
    findingId: row.finding_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface ChartEventRow {
  id: string;
  tooth: string;
  surface: Surface | null;
  state: string | null;
  finding_id: string;
  session_id: string;
  recorded_at: Date;
}

export function toChartEvent(row: ChartEventRow): ChartEvent {
  return {
    id: row.id,
    tooth: row.tooth,
    surface: row.surface,
    state: row.state,
    findingId: row.finding_id,
    sessionId: row.session_id,
    recordedAt: row.recorded_at.toISOString(),
  };
}

export interface PerioRow {
  tooth: string;
  site: PerioSite;
  pocket_depth: number;
  bleeding: boolean;
  recession: number | null;
  recorded_at: Date;
}

export function toPerio(row: PerioRow): PerioMeasurement {
  return {
    tooth: row.tooth,
    site: row.site,
    pocketDepth: row.pocket_depth,
    bleeding: row.bleeding,
    recession: row.recession,
    recordedAt: row.recorded_at.toISOString(),
  };
}

export interface NoteRow {
  id: string;
  type: NoteType;
  body: string;
  recorded_at: Date;
  recorded_by: string | null;
}

export function toNote(row: NoteRow): ClinicalNote {
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    recordedAt: row.recorded_at.toISOString(),
    recordedBy: row.recorded_by,
  };
}

/** The session, locked against completion, which must be open to take new records. */
export async function openSession(client: PoolClient, sessionId: string): Promise<SessionRow> {
  const session = (
    await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM clinical.clinical_sessions WHERE id = $1 FOR SHARE`,
      [sessionId]
    )
  ).rows[0];
  if (!session) throw new HttpProblem(404, 'not_found', 'Session not found.');
  if (session.status === 'signed') {
    throw new HttpProblem(
      409,
      'session_signed',
      'The session is signed; changes need an amendment.'
    );
  }
  if (session.status !== 'open') {
    throw new HttpProblem(409, 'session_closed', 'The session is completed. Start a new one.');
  }
  return session;
}
