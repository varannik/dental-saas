import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const listUsersQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  preferredLocale: z.string().default('en-US').optional(),
  preferredLanguage: z.string().default('en').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE').optional(),
  tenantId: z.string().uuid().optional(),
  userType: z.string().default('STAFF').optional(),
  defaultLocationId: z.string().uuid().optional(),
});

export const updateUserSchema = z
  .object({
    fullName: z.string().min(2).optional(),
    preferredLocale: z.string().optional(),
    preferredLanguage: z.string().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, 'At least one field must be provided.');
