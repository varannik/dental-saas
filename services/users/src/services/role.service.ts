import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';

import { createDatabaseConnection } from '../../../../packages/config/src/database.js';
import {
  permissions,
  rolePermissions,
  roles,
} from '../../../../packages/config/src/schema/tenancy.js';
import type { createRoleSchema } from '../schemas/role.schema.js';

type CreateRoleInput = z.infer<typeof createRoleSchema>;

export async function listRoles(tenantId: string): Promise<unknown[]> {
  const db = createDatabaseConnection();
  return db.select().from(roles).where(eq(roles.tenantId, tenantId));
}

export async function createRole(input: CreateRoleInput): Promise<unknown> {
  const db = createDatabaseConnection();
  const inserted = await db
    .insert(roles)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
    })
    .returning();
  const role = inserted[0];

  const keys = input.permissionKeys ?? [];
  if (keys.length > 0) {
    const permissionRows = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, keys));
    if (permissionRows.length > 0) {
      await db.insert(rolePermissions).values(
        permissionRows.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        }))
      );
    }
  }

  return role;
}

export async function deleteRole(roleId: string, tenantId: string): Promise<boolean> {
  const db = createDatabaseConnection();
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  const deleted = await db
    .delete(roles)
    .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
    .returning({ id: roles.id });
  return Boolean(deleted[0]);
}
