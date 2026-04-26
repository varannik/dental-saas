import { and, eq } from 'drizzle-orm';

import { createDatabaseConnection } from '../../../../packages/config/src/database.js';
import { userTenants, users } from '../../../../packages/config/src/schema/tenancy.js';
import type { z } from 'zod';
import type { createUserSchema, updateUserSchema } from '../schemas/user.schema.js';

type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;

export async function listUsers(tenantId?: string): Promise<unknown[]> {
  const db = createDatabaseConnection();
  if (!tenantId) {
    return db.select().from(users);
  }

  return db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      preferredLocale: users.preferredLocale,
      preferredLanguage: users.preferredLanguage,
      status: users.status,
      tenantId: userTenants.tenantId,
      userType: userTenants.userType,
      defaultLocationId: userTenants.defaultLocationId,
    })
    .from(users)
    .innerJoin(userTenants, eq(userTenants.userId, users.id))
    .where(eq(userTenants.tenantId, tenantId));
}

export async function getUserById(userId: string): Promise<unknown | null> {
  const db = createDatabaseConnection();
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? null;
}

export async function createUser(input: CreateUserInput): Promise<unknown> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing[0]) {
    throw new Error('User with this email already exists.');
  }

  const inserted = await db
    .insert(users)
    .values({
      email: input.email,
      fullName: input.fullName,
      preferredLocale: input.preferredLocale ?? 'en-US',
      preferredLanguage: input.preferredLanguage ?? 'en',
      status: input.status ?? 'ACTIVE',
    })
    .returning();
  const user = inserted[0];

  if (input.tenantId) {
    await db.insert(userTenants).values({
      userId: user.id,
      tenantId: input.tenantId,
      defaultLocationId: input.defaultLocationId,
      userType: input.userType ?? 'STAFF',
    });
  }

  return user;
}

export async function updateUser(userId: string, input: UpdateUserInput): Promise<unknown | null> {
  const db = createDatabaseConnection();
  const result = await db
    .update(users)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return result[0] ?? null;
}

export async function deleteUser(userId: string, tenantId?: string): Promise<boolean> {
  const db = createDatabaseConnection();
  if (tenantId) {
    await db
      .delete(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));
  }

  const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return Boolean(deleted[0]);
}
