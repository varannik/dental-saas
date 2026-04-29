import { z } from 'zod';

const uuid = z.string().uuid();

const optionalInstant = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.union([z.string().datetime({ offset: true }), z.null()]).optional()
);

/** Matches schema-core / operational expectations (extend as needed). */
export const encounterTypeSchema = z.enum([
  'EXAM',
  'EMERGENCY',
  'HYGIENE',
  'ORTHO',
  'IMPLANT',
  'TEACHING',
  'OTHER',
]);

export const createEncounterBodySchema = z.object({
  patientId: uuid,
  locationId: uuid,
  providerId: uuid.optional().nullable(),
  encounterType: encounterTypeSchema,
  scheduledStartAt: optionalInstant,
});

export const encounterIdParamSchema = z.object({
  encounterId: z.string().uuid(),
});

const cursorSchema = z.string().min(1).optional();

export const listEncountersForPatientQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursorSchema,
});

export type CreateEncounterInput = z.infer<typeof createEncounterBodySchema>;
export type ListEncountersForPatientQuery = z.infer<typeof listEncountersForPatientQuerySchema>;
