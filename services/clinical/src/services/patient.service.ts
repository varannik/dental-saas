import { and, desc, eq, ilike, lt, ne, or, type SQL } from 'drizzle-orm';

import { clinicalNotes, createDatabaseConnection, encounters, patients } from '@saas/config';
import type {
  CreatePatientInput,
  ListPatientsQuery,
  SearchPatientsQuery,
  UpdatePatientInput,
} from '../schemas/patient.schema.js';

const notDeleted: SQL = ne(patients.status, 'DELETED');

function formatDob(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function toPatientResponse(row: typeof patients.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    primaryLocationId: row.primaryLocationId,
    firstName: row.firstName,
    lastName: row.lastName,
    dob: formatDob(row.dob as Date | string | null),
    sexAtBirth: row.sexAtBirth,
    genderIdentity: row.genderIdentity,
    contactEmail: row.contactEmail,
    phoneMobile: row.phoneMobile,
    phoneHome: row.phoneHome,
    preferredLocale: row.preferredLocale,
    preferredLanguage: row.preferredLanguage,
    preferredContactMethod: row.preferredContactMethod,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function encodeCursor(createdAt: Date, id: string): string {
  const t = createdAt.toISOString();
  return Buffer.from(JSON.stringify({ t, i: id }), 'utf8').toString('base64url');
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

function buildNamePhoneSearch(q: string): SQL {
  const pattern = `%${q.split('%').join('\\%')}%`;
  return or(
    ilike(patients.firstName, pattern),
    ilike(patients.lastName, pattern),
    ilike(patients.phoneMobile, pattern),
    ilike(patients.phoneHome, pattern)
  ) as SQL;
}

/** Keyset page for (createdAt DESC, id DESC). */
function cursorKeysetCondition(cursor: string): SQL {
  const { t, i } = decodeCursor(cursor);
  const tDate = new Date(t);
  return or(
    lt(patients.createdAt, tDate),
    and(eq(patients.createdAt, tDate), lt(patients.id, i))
  ) as SQL;
}

export async function listPatients(
  tenantId: string,
  query: ListPatientsQuery
): Promise<{ patients: Record<string, unknown>[]; nextCursor: string | null }> {
  const db = createDatabaseConnection();
  const limit = query.limit;
  const conditions: SQL[] = [eq(patients.tenantId, tenantId), notDeleted];
  if (query.q) {
    conditions.push(buildNamePhoneSearch(query.q));
  }
  if (query.cursor) {
    conditions.push(cursorKeysetCondition(query.cursor));
  }
  const where = and(...conditions);
  const take = limit + 1;
  const rows = await db
    .select()
    .from(patients)
    .where(where)
    .orderBy(desc(patients.createdAt), desc(patients.id))
    .limit(take);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt as Date, last.id) : null;
  return {
    patients: page.map((r) => toPatientResponse(r)),
    nextCursor,
  };
}

export async function searchPatients(
  tenantId: string,
  query: SearchPatientsQuery
): Promise<{ patients: Record<string, unknown>[]; nextCursor: string | null }> {
  const db = createDatabaseConnection();
  const limit = query.limit;
  const conditions: SQL[] = [eq(patients.tenantId, tenantId), notDeleted];

  if (query.dob) {
    conditions.push(eq(patients.dob, query.dob));
  }
  if (query.firstName) {
    const pattern = `%${query.firstName.split('%').join('\\%')}%`;
    conditions.push(ilike(patients.firstName, pattern));
  }
  if (query.lastName) {
    const pattern = `%${query.lastName.split('%').join('\\%')}%`;
    conditions.push(ilike(patients.lastName, pattern));
  }
  if (query.phone) {
    const pattern = `%${query.phone.split('%').join('\\%')}%`;
    const phoneOr = or(
      ilike(patients.phoneMobile, pattern),
      ilike(patients.phoneHome, pattern)
    ) as SQL;
    conditions.push(phoneOr);
  }
  if (query.q) {
    conditions.push(buildNamePhoneSearch(query.q));
  }
  if (query.cursor) {
    conditions.push(cursorKeysetCondition(query.cursor));
  }

  const where = and(...conditions);
  const take = limit + 1;
  const rows = await db
    .select()
    .from(patients)
    .where(where)
    .orderBy(desc(patients.createdAt), desc(patients.id))
    .limit(take);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt as Date, last.id) : null;
  return { patients: page.map((r) => toPatientResponse(r)), nextCursor };
}

export async function getPatient(
  patientId: string,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const db = createDatabaseConnection();
  const row = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId), notDeleted) as SQL)
    .limit(1);
  const r = row[0];
  if (!r) return null;
  return toPatientResponse(r);
}

export async function createPatient(
  tenantId: string,
  input: CreatePatientInput
): Promise<Record<string, unknown>> {
  const db = createDatabaseConnection();
  const inserted = await db
    .insert(patients)
    .values({
      tenantId,
      primaryLocationId: input.primaryLocationId ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      dob: input.dob ?? null,
      sexAtBirth: input.sexAtBirth ?? null,
      genderIdentity: input.genderIdentity ?? null,
      contactEmail: input.contactEmail ?? null,
      phoneMobile: input.phoneMobile ?? null,
      phoneHome: input.phoneHome ?? null,
      preferredLocale: input.preferredLocale ?? null,
      preferredLanguage: input.preferredLanguage ?? null,
      preferredContactMethod: input.preferredContactMethod ?? null,
      status: input.status ?? 'ACTIVE',
    })
    .returning();
  const r = inserted[0];
  if (!r) throw new Error('Failed to create patient.');
  return toPatientResponse(r);
}

export async function updatePatient(
  patientId: string,
  tenantId: string,
  input: UpdatePatientInput
): Promise<Record<string, unknown> | null> {
  const db = createDatabaseConnection();
  const set: Record<string, unknown> = {};
  if (input.primaryLocationId !== undefined) set.primaryLocationId = input.primaryLocationId;
  if (input.firstName !== undefined) set.firstName = input.firstName;
  if (input.lastName !== undefined) set.lastName = input.lastName;
  if (input.dob !== undefined) set.dob = input.dob;
  if (input.sexAtBirth !== undefined) set.sexAtBirth = input.sexAtBirth;
  if (input.genderIdentity !== undefined) set.genderIdentity = input.genderIdentity;
  if (input.contactEmail !== undefined) set.contactEmail = input.contactEmail;
  if (input.phoneMobile !== undefined) set.phoneMobile = input.phoneMobile;
  if (input.phoneHome !== undefined) set.phoneHome = input.phoneHome;
  if (input.preferredLocale !== undefined) set.preferredLocale = input.preferredLocale;
  if (input.preferredLanguage !== undefined) set.preferredLanguage = input.preferredLanguage;
  if (input.preferredContactMethod !== undefined) {
    set.preferredContactMethod = input.preferredContactMethod;
  }
  if (input.status !== undefined) set.status = input.status;
  if (Object.keys(set).length === 0) {
    return getPatient(patientId, tenantId);
  }
  (set as { updatedAt: Date }).updatedAt = new Date();
  const updated = await db
    .update(patients)
    .set(set as typeof patients.$inferInsert)
    .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId), notDeleted) as SQL)
    .returning();
  const r = updated[0];
  if (!r) return null;
  return toPatientResponse(r);
}

export async function softDeletePatient(patientId: string, tenantId: string): Promise<boolean> {
  const db = createDatabaseConnection();
  const updated = await db
    .update(patients)
    .set({ status: 'DELETED', updatedAt: new Date() })
    .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId), notDeleted) as SQL)
    .returning({ id: patients.id });
  return Boolean(updated[0]);
}

export async function getPatientHistory(
  patientId: string,
  tenantId: string
): Promise<{
  encounters: Record<string, unknown>[];
  notes: Record<string, unknown>[];
} | null> {
  const db = createDatabaseConnection();
  const p = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId), notDeleted) as SQL)
    .limit(1);
  if (!p[0]) return null;

  const enc = await db
    .select()
    .from(encounters)
    .where(and(eq(encounters.patientId, patientId), eq(encounters.tenantId, tenantId)) as SQL)
    .orderBy(desc(encounters.scheduledStartAt), desc(encounters.createdAt));
  const notes = await db
    .select()
    .from(clinicalNotes)
    .where(and(eq(clinicalNotes.patientId, patientId), eq(clinicalNotes.tenantId, tenantId)) as SQL)
    .orderBy(desc(clinicalNotes.createdAt));

  return { encounters: enc, notes: notes };
}
