import { z } from 'zod';

export const listRolesQuerySchema = z.object({
  tenantId: z.string().uuid(),
});

export const createRoleSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  permissionKeys: z.array(z.string()).default([]).optional(),
});
