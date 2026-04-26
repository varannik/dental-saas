import { eq } from 'drizzle-orm';
import type { z } from 'zod';

import { createDatabaseConnection } from '../../../../packages/config/src/database.js';
import { tenants } from '../../../../packages/config/src/schema/tenancy.js';
import type { createTenantSchema } from '../schemas/tenant.schema.js';

type CreateTenantInput = z.infer<typeof createTenantSchema>;

export async function listTenants(): Promise<unknown[]> {
  const db = createDatabaseConnection();
  return db.select().from(tenants);
}

export async function createTenant(input: CreateTenantInput): Promise<unknown> {
  const db = createDatabaseConnection();
  const inserted = await db
    .insert(tenants)
    .values({
      name: input.name,
      type: input.type,
      primaryRegion: input.primaryRegion ?? 'eu-central-1',
      defaultLocale: input.defaultLocale ?? 'en-US',
      supportedLocales: input.supportedLocales ?? ['en-US'],
      supportedLanguages: input.supportedLanguages ?? ['en'],
      partitionStrategy: input.partitionStrategy ?? 'ROW_LEVEL',
      status: input.status ?? 'ACTIVE',
    })
    .returning();
  return inserted[0];
}

export async function getTenantById(tenantId: string): Promise<unknown | null> {
  const db = createDatabaseConnection();
  const result = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return result[0] ?? null;
}
