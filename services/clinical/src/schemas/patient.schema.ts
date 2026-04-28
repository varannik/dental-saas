import { z } from 'zod';

const uuid = z.string().uuid();

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .optional()
  .nullable();

export const createPatientBodySchema = z.object({
  primaryLocationId: uuid.optional().nullable(),
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
  dob: optionalDate,
  sexAtBirth: z.string().max(50).optional().nullable(),
  genderIdentity: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().max(320).optional().nullable(),
  phoneMobile: z.string().max(40).optional().nullable(),
  phoneHome: z.string().max(40).optional().nullable(),
  preferredLocale: z.string().max(20).optional().nullable(),
  preferredLanguage: z.string().max(16).optional().nullable(),
  preferredContactMethod: z.string().max(32).optional().nullable(),
  status: z.string().max(32).default('ACTIVE').optional(),
});

export const updatePatientBodySchema = createPatientBodySchema.partial();

const cursorSchema = z.string().min(1).optional();

export const listPatientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursorSchema,
  q: z.string().min(1).max(200).optional(),
});

export const searchPatientsQuerySchema = z.object({
  firstName: z.string().min(1).max(200).optional(),
  lastName: z.string().min(1).max(200).optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  phone: z.string().min(3).max(40).optional(),
  q: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursorSchema,
});

export const patientIdParamSchema = z.object({
  patientId: z.string().uuid(),
});

export type CreatePatientInput = z.infer<typeof createPatientBodySchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientBodySchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
export type SearchPatientsQuery = z.infer<typeof searchPatientsQuerySchema>;
