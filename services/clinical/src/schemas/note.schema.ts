import { z } from 'zod';

const uuid = z.string().uuid();

/** Matches phase-2 guide; extend as product adds types. */
export const clinicalNoteTypeSchema = z.enum([
  'SOAP',
  'PROGRESS',
  'RADIOLOGY_REPORT',
  'TREATMENT_NARRATIVE',
]);

export const createClinicalNoteBodySchema = z.object({
  noteType: clinicalNoteTypeSchema,
  content: z.string().min(1).max(512_000),
  language: z.string().min(1).max(32).optional().nullable(),
  locale: z.string().min(1).max(64).optional().nullable(),
});

export const updateClinicalNoteBodySchema = z
  .object({
    noteType: clinicalNoteTypeSchema.optional(),
    content: z.string().min(1).max(512_000).optional(),
    language: z.string().min(1).max(32).optional().nullable(),
    locale: z.string().min(1).max(64).optional().nullable(),
  })
  .refine(
    (o) =>
      o.noteType !== undefined ||
      o.content !== undefined ||
      o.language !== undefined ||
      o.locale !== undefined,
    { message: 'At least one field is required.' }
  );

export const encounterIdParamForNotesSchema = z.object({
  encounterId: uuid,
});

export const clinicalNoteIdParamSchema = z.object({
  noteId: uuid,
});

export type CreateClinicalNoteInput = z.infer<typeof createClinicalNoteBodySchema>;
export type UpdateClinicalNoteInput = z.infer<typeof updateClinicalNoteBodySchema>;
