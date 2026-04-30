import { z } from 'zod';

const uuid = z.string().uuid();

/** Universal numbering 1–32 (permanent dentition). */
export const universalToothNumberSchema = z
  .string()
  .regex(/^(?:[1-9]|[12][0-9]|3[0-2])$/, 'Must be universal tooth 1–32.');

export const dentalSurfaceSchema = z.enum(['M', 'O', 'D', 'B', 'L', 'I']);

export const dentalConditionSchema = z.enum([
  'HEALTHY',
  'CARIES',
  'FILLING',
  'CROWN',
  'MISSING',
  'IMPLANT',
  'ROOT_CANAL',
  'SEALANT',
  'BRIDGE',
  'VENEER',
  'FRACTURE',
  'OTHER',
]);

export const createDentalChartEntryBodySchema = z.object({
  toothNumber: universalToothNumberSchema,
  surface: dentalSurfaceSchema.nullable().optional(),
  condition: dentalConditionSchema,
  cdtCode: z.string().min(1).max(32).nullable().optional(),
  notes: z.string().max(16_000).nullable().optional(),
  diagnosedAt: z.string().datetime({ offset: true }).optional(),
  diagnosedById: uuid.optional(),
  encounterId: uuid.nullable().optional(),
});

export const updateDentalChartEntryBodySchema = z
  .object({
    toothNumber: universalToothNumberSchema.optional(),
    surface: dentalSurfaceSchema.nullable().optional(),
    condition: dentalConditionSchema.optional(),
    cdtCode: z.string().min(1).max(32).nullable().optional(),
    notes: z.string().max(16_000).nullable().optional(),
    encounterId: uuid.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required.' });

export const chartEntryIdParamSchema = z.object({
  entryId: uuid,
});

export const listChartHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateDentalChartEntryInput = z.infer<typeof createDentalChartEntryBodySchema>;
export type UpdateDentalChartEntryInput = z.infer<typeof updateDentalChartEntryBodySchema>;
export type ListChartHistoryQuery = z.infer<typeof listChartHistoryQuerySchema>;
