import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(2),
  primaryRegion: z.string().default('eu-central-1').optional(),
  defaultLocale: z.string().default('en-US').optional(),
  supportedLocales: z.array(z.string()).default(['en-US']).optional(),
  supportedLanguages: z.array(z.string()).default(['en']).optional(),
  partitionStrategy: z.string().default('ROW_LEVEL').optional(),
  status: z.string().default('ACTIVE').optional(),
});
