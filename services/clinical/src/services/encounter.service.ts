import { and, desc, eq, lt, ne, or, type SQL } from 'drizzle-orm';

import { createDatabaseConnection, encounters, locations, patients } from '@saas/config';
import type {
  CreateEncounterInput,
  ListEncountersForPatientQuery,
} from '../schemas/encounter.schema.js';

const patientActive: SQL = ne(patients.status, 'DELETED');

export class EncounterStateError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'EncounterStateError';
  }
}

export class EncounterNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Encounter not found.');
    this.name = 'EncounterNotFoundError';
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), i: id }), 'utf8').toString(
    'base64url'
  );
}

function decodeCursor(cursor: string): { t: string; i: string } {
  const json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
    t: string;
    i: string;
  };
  if (typeof json?.t !== 'string' || typeof json?.i !== 'string') {
    throw new Error('Invalid cursor');
  }
  return { t: json.t, i: json.i };
}

function cursorKeysetCondition(cursor: string): SQL {
  const { t, i } = decodeCursor(cursor);
  const tDate = new Date(t);
  return or(
    lt(encounters.createdAt, tDate),
    and(eq(encounters.createdAt, tDate), lt(encounters.id, i))
  ) as SQL;
}

export function toEncounterResponse(row: typeof encounters.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    patientId: row.patientId,
    locationId: row.locationId,
    providerId: row.providerId,
    encounterType: row.encounterType,
    status: row.status,
    scheduledStartAt:
      row.scheduledStartAt == null ? null : (row.scheduledStartAt as Date).toISOString(),
    checkInAt: row.checkInAt == null ? null : (row.checkInAt as Date).toISOString(),
    checkOutAt: row.checkOutAt == null ? null : (row.checkOutAt as Date).toISOString(),
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

async function assertPatientEligible(patientId: string, tenantId: string): Promise<void> {
  const db = createDatabaseConnection();
  const row = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId), patientActive) as SQL)
    .limit(1);
  if (!row[0]) {
    throw new EncounterStateError('Patient not found or not available for new encounters.');
  }
}

async function assertLocationForTenant(locationId: string, tenantId: string): Promise<void> {
  const db = createDatabaseConnection();
  const row = await db
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.id, locationId),
        eq(locations.tenantId, tenantId),
        eq(locations.status, 'ACTIVE')
      ) as SQL
    )
    .limit(1);
  if (!row[0]) {
    throw new EncounterStateError('Location not found or inactive for this tenant.');
  }
}

export async function createEncounter(
  tenantId: string,
  input: CreateEncounterInput
): Promise<Record<string, unknown>> {
  await assertPatientEligible(input.patientId, tenantId);
  await assertLocationForTenant(input.locationId, tenantId);

  const db = createDatabaseConnection();
  const inserted = await db
    .insert(encounters)
    .values({
      tenantId,
      patientId: input.patientId,
      locationId: input.locationId,
      providerId: input.providerId ?? null,
      encounterType: input.encounterType,
      status: 'SCHEDULED',
      scheduledStartAt: input.scheduledStartAt ? new Date(input.scheduledStartAt) : null,
    })
    .returning();
  const r = inserted[0];
  if (!r) throw new Error('Failed to create encounter.');
  return toEncounterResponse(r);
}

export async function getEncounter(
  encounterId: string,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const db = createDatabaseConnection();
  const row = await db
    .select()
    .from(encounters)
    .where(and(eq(encounters.id, encounterId), eq(encounters.tenantId, tenantId)) as SQL)
    .limit(1);
  const r = row[0];
  if (!r) return null;
  return toEncounterResponse(r);
}

export async function listEncountersForPatient(
  patientId: string,
  tenantId: string,
  query: ListEncountersForPatientQuery
): Promise<{ encounters: Record<string, unknown>[]; nextCursor: string | null } | null> {
  const db = createDatabaseConnection();
  const p = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId), patientActive) as SQL)
    .limit(1);
  if (!p[0]) return null;

  const limit = query.limit;
  const conditions: SQL[] = [
    eq(encounters.patientId, patientId),
    eq(encounters.tenantId, tenantId),
  ];
  if (query.cursor) {
    conditions.push(cursorKeysetCondition(query.cursor));
  }
  const where = and(...conditions);
  const take = limit + 1;
  const rows = await db
    .select()
    .from(encounters)
    .where(where)
    .orderBy(desc(encounters.createdAt), desc(encounters.id))
    .limit(take);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt as Date, last.id) : null;
  return {
    encounters: page.map((r) => toEncounterResponse(r)),
    nextCursor,
  };
}

/**
 * CHECKED_IN → IN_PROGRESS (state machine step before check-out when using the full lifecycle).
 */
export async function beginEncounterInProgress(
  encounterId: string,
  tenantId: string
): Promise<Record<string, unknown>> {
  const db = createDatabaseConnection();
  const now = new Date();
  const existing = await db
    .select()
    .from(encounters)
    .where(and(eq(encounters.id, encounterId), eq(encounters.tenantId, tenantId)) as SQL)
    .limit(1);
  const row = existing[0];
  if (!row) throw new EncounterNotFoundError();
  if (row.status !== 'CHECKED_IN') {
    throw new EncounterStateError(
      `Cannot start visit: encounter status is ${row.status}; expected CHECKED_IN.`
    );
  }
  const updated = await db
    .update(encounters)
    .set({
      status: 'IN_PROGRESS',
      updatedAt: now,
    })
    .where(
      and(
        eq(encounters.id, encounterId),
        eq(encounters.tenantId, tenantId),
        eq(encounters.status, 'CHECKED_IN')
      ) as SQL
    )
    .returning();
  const r = updated[0];
  if (!r) throw new EncounterStateError('Encounter already updated; refresh and retry.');
  return toEncounterResponse(r);
}

export async function checkInEncounter(
  encounterId: string,
  tenantId: string
): Promise<Record<string, unknown>> {
  const db = createDatabaseConnection();
  const now = new Date();
  const existing = await db
    .select()
    .from(encounters)
    .where(and(eq(encounters.id, encounterId), eq(encounters.tenantId, tenantId)) as SQL)
    .limit(1);
  const row = existing[0];
  if (!row) throw new EncounterNotFoundError();
  if (row.status !== 'SCHEDULED') {
    throw new EncounterStateError(
      `Cannot check in: encounter status is ${row.status}; expected SCHEDULED.`
    );
  }
  const updated = await db
    .update(encounters)
    .set({
      status: 'CHECKED_IN',
      checkInAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(encounters.id, encounterId),
        eq(encounters.tenantId, tenantId),
        eq(encounters.status, 'SCHEDULED')
      ) as SQL
    )
    .returning();
  const r = updated[0];
  if (!r) throw new EncounterStateError('Encounter already updated; refresh and retry.');
  return toEncounterResponse(r);
}

export async function checkOutEncounter(
  encounterId: string,
  tenantId: string
): Promise<Record<string, unknown>> {
  const db = createDatabaseConnection();
  const now = new Date();
  const existing = await db
    .select()
    .from(encounters)
    .where(and(eq(encounters.id, encounterId), eq(encounters.tenantId, tenantId)) as SQL)
    .limit(1);
  const row = existing[0];
  if (!row) throw new EncounterNotFoundError();
  if (row.status !== 'CHECKED_IN' && row.status !== 'IN_PROGRESS') {
    throw new EncounterStateError(
      `Cannot check out: encounter status is ${row.status}; expected CHECKED_IN or IN_PROGRESS.`
    );
  }
  const updated = await db
    .update(encounters)
    .set({
      status: 'COMPLETED',
      checkOutAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(encounters.id, encounterId),
        eq(encounters.tenantId, tenantId),
        eq(encounters.status, row.status)
      ) as SQL
    )
    .returning();
  const r = updated[0];
  if (!r) throw new EncounterStateError('Encounter already updated; refresh and retry.');
  return toEncounterResponse(r);
}
