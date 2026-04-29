import { z } from 'zod';

const uuid = z.string().uuid();

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .optional()
  .nullable();

export const createPatientBodySchema = z.object({
  primaryLocationId: uuid.optional().nullable(),
  firstName: z.string().min(1).max(200).trim(),
  lastName: z.string().min(1).max(200).trim(),
  dob: optionalDate,
  sexAtBirth: z.string().max(50).optional().nullable(),
  genderIdentity: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().max(320).optional().nullable(),
  phoneMobile: z.string().max(40).optional().nullable(),
  phoneHome: z.string().max(40).optional().nullable(),
  preferredLocale: z.string().max(20).optional().nullable(),
  preferredLanguage: z.string().max(16).optional().nullable(),
  preferredContactMethod: z.string().max(32).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const updatePatientBodySchema = createPatientBodySchema.partial();

const cursorSchema = z.string().min(1).optional();

export const listPatientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursorSchema,
  q: z.string().min(1).max(200).optional(),
});

export const searchPatientsQuerySchema = z
  .object({
    firstName: z.string().min(1).max(200).trim().optional(),
    lastName: z.string().min(1).max(200).trim().optional(),
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    phone: z.string().min(3).max(40).trim().optional(),
    /** Broad match across name + phone fields */
    q: z.string().min(1).max(200).trim().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: cursorSchema,
  })
  .superRefine((val, ctx) => {
    const hasCriterion = Boolean(val.firstName ?? val.lastName ?? val.dob ?? val.phone ?? val.q);
    if (!hasCriterion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide at least one of: firstName, lastName, dob, phone, or q (avoids full-table scan).',
      });
    }
  });

export const patientIdParamSchema = z.object({
  patientId: z.string().uuid(),
});

export type CreatePatientInput = z.infer<typeof createPatientBodySchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientBodySchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
export type SearchPatientsQuery = z.infer<typeof searchPatientsQuerySchema>;
