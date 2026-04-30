import { z } from 'zod';

const uuid = z.string().uuid();

export const treatmentPlanIdParamSchema = z.object({
  planId: uuid,
});

export const treatmentPlanItemParamsSchema = z.object({
  planId: uuid,
  itemId: uuid,
});

export const createTreatmentPlanBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(16_000).nullable().optional(),
  totalEstimatedCost: z.coerce.number().nonnegative().nullable().optional(),
  estimatedInsuranceCoverage: z.coerce.number().nonnegative().nullable().optional(),
});

export const createTreatmentPlanItemBodySchema = z.object({
  cdtCode: z.string().min(1).max(32),
  toothNumber: z.string().max(8).nullable().optional(),
  surface: z.string().max(8).nullable().optional(),
  phase: z.coerce.number().int().min(0).nullable().optional(),
  sequenceOrder: z.coerce.number().int().min(0).nullable().optional(),
  estimatedFee: z.coerce.number().nonnegative().nullable().optional(),
  estimatedPatientPortion: z.coerce.number().nonnegative().nullable().optional(),
  notes: z.string().max(8_000).nullable().optional(),
});

export const updateTreatmentPlanItemBodySchema = z
  .object({
    cdtCode: z.string().min(1).max(32).optional(),
    toothNumber: z.string().max(8).nullable().optional(),
    surface: z.string().max(8).nullable().optional(),
    phase: z.coerce.number().int().min(0).nullable().optional(),
    sequenceOrder: z.coerce.number().int().min(0).nullable().optional(),
    estimatedFee: z.coerce.number().nonnegative().nullable().optional(),
    estimatedPatientPortion: z.coerce.number().nonnegative().nullable().optional(),
    notes: z.string().max(8_000).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required.' });

export type CreateTreatmentPlanInput = z.infer<typeof createTreatmentPlanBodySchema>;
export type CreateTreatmentPlanItemInput = z.infer<typeof createTreatmentPlanItemBodySchema>;
export type UpdateTreatmentPlanItemInput = z.infer<typeof updateTreatmentPlanItemBodySchema>;
