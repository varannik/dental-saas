import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';

import { clinicalNotes, createDatabaseConnection, encounters } from '@saas/config';

import { EncounterNotFoundError } from './encounter.service.js';
import type { CreateClinicalNoteInput, UpdateClinicalNoteInput } from '../schemas/note.schema.js';

export class NoteNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Clinical note not found.');
    this.name = 'NoteNotFoundError';
  }
}

export class NoteForbiddenError extends Error {
  readonly statusCode = 403;

  constructor(message = 'You may only modify or sign your own notes.') {
    super(message);
    this.name = 'NoteForbiddenError';
  }
}

export class NoteConflictError extends Error {
  readonly statusCode = 409;

  constructor(message = 'This note is signed and cannot be changed.') {
    super(message);
    this.name = 'NoteConflictError';
  }
}

export function toNoteResponse(row: typeof clinicalNotes.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    patientId: row.patientId,
    encounterId: row.encounterId,
    authorId: row.authorId,
    noteType: row.noteType,
    content: row.content,
    language: row.language,
    locale: row.locale,
    signedAt: row.signedAt == null ? null : (row.signedAt as Date).toISOString(),
    signedById: row.signedById,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

export async function createClinicalNote(
  tenantId: string,
  encounterId: string,
  authorId: string,
  input: CreateClinicalNoteInput
): Promise<Record<string, unknown>> {
  const db = createDatabaseConnection();
  const encRows = await db
    .select()
    .from(encounters)
    .where(and(eq(encounters.id, encounterId), eq(encounters.tenantId, tenantId)) as SQL)
    .limit(1);
  const enc = encRows[0];
  if (!enc) throw new EncounterNotFoundError();

  const inserted = await db
    .insert(clinicalNotes)
    .values({
      tenantId,
      patientId: enc.patientId,
      encounterId,
      authorId,
      noteType: input.noteType,
      content: input.content,
      language: input.language ?? null,
      locale: input.locale ?? null,
    })
    .returning();
  const r = inserted[0];
  if (!r) throw new Error('Failed to create clinical note.');
  return toNoteResponse(r);
}

export async function listClinicalNotesForEncounter(
  encounterId: string,
  tenantId: string
): Promise<Record<string, unknown>[] | null> {
  const db = createDatabaseConnection();
  const enc = await db
    .select({ id: encounters.id })
    .from(encounters)
    .where(and(eq(encounters.id, encounterId), eq(encounters.tenantId, tenantId)) as SQL)
    .limit(1);
  if (!enc[0]) return null;

  const rows = await db
    .select()
    .from(clinicalNotes)
    .where(
      and(eq(clinicalNotes.encounterId, encounterId), eq(clinicalNotes.tenantId, tenantId)) as SQL
    )
    .orderBy(desc(clinicalNotes.createdAt), desc(clinicalNotes.id));

  return rows.map((r) => toNoteResponse(r));
}

export async function getClinicalNote(
  noteId: string,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const db = createDatabaseConnection();
  const row = await db
    .select()
    .from(clinicalNotes)
    .where(and(eq(clinicalNotes.id, noteId), eq(clinicalNotes.tenantId, tenantId)) as SQL)
    .limit(1);
  const r = row[0];
  if (!r) return null;
  return toNoteResponse(r);
}

async function loadNoteForMutation(
  noteId: string,
  tenantId: string
): Promise<typeof clinicalNotes.$inferSelect> {
  const db = createDatabaseConnection();
  const row = await db
    .select()
    .from(clinicalNotes)
    .where(and(eq(clinicalNotes.id, noteId), eq(clinicalNotes.tenantId, tenantId)) as SQL)
    .limit(1);
  const r = row[0];
  if (!r) throw new NoteNotFoundError();
  return r;
}

export async function updateClinicalNote(
  noteId: string,
  tenantId: string,
  userId: string,
  input: UpdateClinicalNoteInput
): Promise<Record<string, unknown>> {
  const existing = await loadNoteForMutation(noteId, tenantId);
  if (existing.signedAt != null) {
    throw new NoteConflictError();
  }
  if (existing.authorId !== userId) {
    throw new NoteForbiddenError();
  }

  const db = createDatabaseConnection();
  const now = new Date();
  const updated = await db
    .update(clinicalNotes)
    .set({
      ...(input.noteType !== undefined ? { noteType: input.noteType } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(clinicalNotes.id, noteId),
        eq(clinicalNotes.tenantId, tenantId),
        isNull(clinicalNotes.signedAt),
        eq(clinicalNotes.authorId, userId)
      ) as SQL
    )
    .returning();
  const r = updated[0];
  if (!r) throw new NoteConflictError('Unable to update note; refresh and retry.');
  return toNoteResponse(r);
}

export async function signClinicalNote(
  noteId: string,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const existing = await loadNoteForMutation(noteId, tenantId);
  if (existing.signedAt != null) {
    throw new NoteConflictError('This note is already signed.');
  }
  if (existing.authorId !== userId) {
    throw new NoteForbiddenError('You may only sign your own notes.');
  }

  const db = createDatabaseConnection();
  const now = new Date();
  const updated = await db
    .update(clinicalNotes)
    .set({
      signedAt: now,
      signedById: userId,
      updatedAt: now,
    })
    .where(
      and(
        eq(clinicalNotes.id, noteId),
        eq(clinicalNotes.tenantId, tenantId),
        isNull(clinicalNotes.signedAt),
        eq(clinicalNotes.authorId, userId)
      ) as SQL
    )
    .returning();
  const r = updated[0];
  if (!r) throw new NoteConflictError('Unable to sign note; refresh and retry.');
  return toNoteResponse(r);
}
