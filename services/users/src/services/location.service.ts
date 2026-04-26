import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';

import { createDatabaseConnection } from '../../../../packages/config/src/database.js';
import { locations } from '../../../../packages/config/src/schema/tenancy.js';
import type { createLocationSchema } from '../schemas/location.schema.js';

type CreateLocationInput = z.infer<typeof createLocationSchema>;

export async function listLocations(tenantId: string): Promise<unknown[]> {
  const db = createDatabaseConnection();
  return db.select().from(locations).where(eq(locations.tenantId, tenantId));
}

export async function createLocation(input: CreateLocationInput): Promise<unknown> {
  const db = createDatabaseConnection();
  const inserted = await db
    .insert(locations)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      timezone: input.timezone ?? 'UTC',
      status: input.status ?? 'ACTIVE',
      address: input.address ?? null,
    })
    .returning();
  return inserted[0];
}

export async function deleteLocation(locationId: string, tenantId: string): Promise<boolean> {
  const db = createDatabaseConnection();
  const deleted = await db
    .delete(locations)
    .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenantId)))
    .returning({ id: locations.id });
  return Boolean(deleted[0]);
}
