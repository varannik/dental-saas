import { z } from 'zod';

export const listLocationsQuerySchema = z.object({
  tenantId: z.string().uuid(),
});

export const createLocationSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2),
  timezone: z.string().default('UTC').optional(),
  status: z.string().default('ACTIVE').optional(),
  address: z.record(z.string(), z.unknown()).optional(),
});
