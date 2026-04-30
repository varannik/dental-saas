import { and, desc, eq, isNull, ne, type SQL } from 'drizzle-orm';

import {
  createDatabaseConnection,
  dentalChartEntries,
  dentalChartEntryEvents,
  encounters,
  patients,
} from '@saas/config';
import type {
  CreateDentalChartEntryInput,
  ListChartHistoryQuery,
  UpdateDentalChartEntryInput,
} from '../schemas/dental-chart.schema.js';

const patientActive: SQL = ne(patients.status, 'DELETED');

export class ChartPatientNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Patient not found.');
    this.name = 'ChartPatientNotFoundError';
  }
}

export class ChartEntryNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Chart entry not found.');
    this.name = 'ChartEntryNotFoundError';
  }
}

export class ChartEncounterMismatchError extends Error {
  readonly statusCode = 400;

  constructor(message = 'Encounter does not belong to this patient.') {
    super(message);
    this.name = 'ChartEncounterMismatchError';
  }
}

function entryToSnapshot(row: typeof dentalChartEntries.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    patientId: row.patientId,
    toothNumber: row.toothNumber,
    surface: row.surface,
    condition: row.condition,
    cdtCode: row.cdtCode,
    notes: row.notes,
    diagnosedAt: row.diagnosedAt == null ? null : (row.diagnosedAt as Date).toISOString(),
    diagnosedById: row.diagnosedById,
    encounterId: row.encounterId,
    deletedAt: row.deletedAt == null ? null : (row.deletedAt as Date).toISOString(),
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

export function toChartEntryResponse(
  row: typeof dentalChartEntries.$inferSelect
): Record<string, unknown> {
  const s = entryToSnapshot(row);
  delete s['deletedAt'];
  return s;
}

async function assertPatientInTenant(patientId: string, tenantId: string): Promise<void> {
  const db = createDatabaseConnection();
  const row = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId), patientActive) as SQL)
    .limit(1);
  if (!row[0]) throw new ChartPatientNotFoundError();
}

async function assertEncounterForPatient(
  encounterId: string,
  patientId: string,
  tenantId: string
): Promise<void> {
  const db = createDatabaseConnection();
  const row = await db
    .select({ id: encounters.id })
    .from(encounters)
    .where(
      and(
        eq(encounters.id, encounterId),
        eq(encounters.patientId, patientId),
        eq(encounters.tenantId, tenantId)
      ) as SQL
    )
    .limit(1);
  if (!row[0]) throw new ChartEncounterMismatchError();
}

async function insertChartEvent(
  tenantId: string,
  patientId: string,
  chartEntryId: string,
  eventType: 'CREATED' | 'UPDATED' | 'DELETED',
  actorId: string,
  snapshot: Record<string, unknown>
): Promise<void> {
  const db = createDatabaseConnection();
  await db.insert(dentalChartEntryEvents).values({
    tenantId,
    patientId,
    chartEntryId,
    eventType,
    actorId,
    snapshot,
  });
}

/** Active entries only; grouped by universal tooth 1–32 for quick UI binding. */
export async function getDentalChartForPatient(
  patientId: string,
  tenantId: string
): Promise<Record<string, unknown>> {
  await assertPatientInTenant(patientId, tenantId);

  const db = createDatabaseConnection();
  const rows = await db
    .select()
    .from(dentalChartEntries)
    .where(
      and(
        eq(dentalChartEntries.patientId, patientId),
        eq(dentalChartEntries.tenantId, tenantId),
        isNull(dentalChartEntries.deletedAt)
      ) as SQL
    )
    .orderBy(desc(dentalChartEntries.diagnosedAt), desc(dentalChartEntries.id));

  const entries = rows.map((r) => toChartEntryResponse(r));
  const byTooth: Record<string, Record<string, unknown>[]> = {};
  for (let n = 1; n <= 32; n += 1) {
    byTooth[String(n)] = [];
  }
  for (const e of entries) {
    const tn = String(e.toothNumber);
    if (byTooth[tn]) {
      byTooth[tn].push(e);
    }
  }

  return { chart: { entries, byTooth } };
}

export async function createDentalChartEntry(
  tenantId: string,
  patientId: string,
  actorUserId: string,
  input: CreateDentalChartEntryInput
): Promise<Record<string, unknown>> {
  await assertPatientInTenant(patientId, tenantId);

  const diagnosedById = input.diagnosedById ?? actorUserId;
  const encounterId = input.encounterId ?? null;
  if (encounterId) {
    await assertEncounterForPatient(encounterId, patientId, tenantId);
  }

  const db = createDatabaseConnection();
  const diagnosedAt = input.diagnosedAt ? new Date(input.diagnosedAt) : new Date();
  const now = new Date();

  const inserted = await db
    .insert(dentalChartEntries)
    .values({
      tenantId,
      patientId,
      toothNumber: input.toothNumber,
      surface: input.surface ?? null,
      condition: input.condition,
      cdtCode: input.cdtCode ?? null,
      notes: input.notes ?? null,
      diagnosedAt,
      diagnosedById,
      deletedAt: null,
      encounterId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create chart entry.');

  const snapshot = entryToSnapshot(row);
  await insertChartEvent(tenantId, patientId, row.id, 'CREATED', actorUserId, snapshot);

  return toChartEntryResponse(row);
}

async function loadEntry(
  entryId: string,
  tenantId: string
): Promise<typeof dentalChartEntries.$inferSelect> {
  const db = createDatabaseConnection();
  const rows = await db
    .select()
    .from(dentalChartEntries)
    .where(
      and(eq(dentalChartEntries.id, entryId), eq(dentalChartEntries.tenantId, tenantId)) as SQL
    )
    .limit(1);
  const row = rows[0];
  if (!row || row.deletedAt != null) throw new ChartEntryNotFoundError();
  return row;
}

export async function updateDentalChartEntry(
  entryId: string,
  tenantId: string,
  actorUserId: string,
  input: UpdateDentalChartEntryInput
): Promise<Record<string, unknown>> {
  const existing = await loadEntry(entryId, tenantId);
  const patientId = existing.patientId;

  if (input.encounterId !== undefined && input.encounterId != null) {
    await assertEncounterForPatient(input.encounterId, patientId, tenantId);
  }

  const db = createDatabaseConnection();
  const now = new Date();
  const updated = await db
    .update(dentalChartEntries)
    .set({
      ...(input.toothNumber !== undefined ? { toothNumber: input.toothNumber } : {}),
      ...(input.surface !== undefined ? { surface: input.surface } : {}),
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
      ...(input.cdtCode !== undefined ? { cdtCode: input.cdtCode } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.encounterId !== undefined ? { encounterId: input.encounterId } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(dentalChartEntries.id, entryId),
        eq(dentalChartEntries.tenantId, tenantId),
        isNull(dentalChartEntries.deletedAt)
      ) as SQL
    )
    .returning();
  const row = updated[0];
  if (!row) throw new ChartEntryNotFoundError();

  await insertChartEvent(tenantId, patientId, row.id, 'UPDATED', actorUserId, entryToSnapshot(row));

  return toChartEntryResponse(row);
}

export async function softDeleteDentalChartEntry(
  entryId: string,
  tenantId: string,
  actorUserId: string
): Promise<void> {
  const existing = await loadEntry(entryId, tenantId);
  const patientId = existing.patientId;

  const db = createDatabaseConnection();
  const now = new Date();
  const updated = await db
    .update(dentalChartEntries)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(dentalChartEntries.id, entryId),
        eq(dentalChartEntries.tenantId, tenantId),
        isNull(dentalChartEntries.deletedAt)
      ) as SQL
    )
    .returning();
  const row = updated[0];
  if (!row) throw new ChartEntryNotFoundError();

  await insertChartEvent(tenantId, patientId, row.id, 'DELETED', actorUserId, entryToSnapshot(row));
}

export async function listDentalChartHistory(
  patientId: string,
  tenantId: string,
  query: ListChartHistoryQuery
): Promise<Record<string, unknown>[]> {
  await assertPatientInTenant(patientId, tenantId);

  const db = createDatabaseConnection();
  const rows = await db
    .select()
    .from(dentalChartEntryEvents)
    .where(
      and(
        eq(dentalChartEntryEvents.patientId, patientId),
        eq(dentalChartEntryEvents.tenantId, tenantId)
      ) as SQL
    )
    .orderBy(desc(dentalChartEntryEvents.occurredAt), desc(dentalChartEntryEvents.id))
    .limit(query.limit);

  return rows.map((r) => ({
    id: r.id,
    chartEntryId: r.chartEntryId,
    eventType: r.eventType,
    actorId: r.actorId,
    snapshot: r.snapshot,
    occurredAt: (r.occurredAt as Date).toISOString(),
  }));
}
