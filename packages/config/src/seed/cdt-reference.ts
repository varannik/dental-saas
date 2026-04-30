import { and, eq } from 'drizzle-orm';

import { createDatabaseConnection } from '../database.js';
import {
  CDT_PROCEDURE_SEED_ROWS,
  CDT_SEED_VERSION,
  CDT_SYSTEM_KEY,
} from '../seed-data/cdt-procedures.js';
import { codeSystems, codeValues, procedureCatalog, tenants } from '../schema/index.js';

async function getOrCreateCdtCodeSystem(tenantId: string): Promise<string> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: codeSystems.id })
    .from(codeSystems)
    .where(
      and(
        eq(codeSystems.tenantId, tenantId),
        eq(codeSystems.systemKey, CDT_SYSTEM_KEY),
        eq(codeSystems.version, CDT_SEED_VERSION)
      )
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(codeSystems)
    .values({
      tenantId,
      systemKey: CDT_SYSTEM_KEY,
      name: 'Current Dental Terminology (seed subset)',
      version: CDT_SEED_VERSION,
      isActive: true,
      metadata: {
        publisher: 'ADA',
        scope: 'development_seed',
        notice:
          'Non-exhaustive dev seed only; not a complete or authoritative CDT distribution. Obtain licensed data separately for production.',
      },
    })
    .returning({ id: codeSystems.id });

  return inserted[0].id;
}

async function getOrCreateCdtCodeValue(
  tenantId: string,
  systemId: string,
  row: (typeof CDT_PROCEDURE_SEED_ROWS)[number]
): Promise<string> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: codeValues.id })
    .from(codeValues)
    .where(
      and(
        eq(codeValues.tenantId, tenantId),
        eq(codeValues.systemId, systemId),
        eq(codeValues.code, row.code)
      )
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(codeValues)
    .values({
      tenantId,
      systemId,
      code: row.code,
      display: row.display,
      description: row.description,
      category: row.category,
      isBillable: row.isBillable,
      isActive: true,
      metadata: { procedureType: row.procedureType },
    })
    .returning({ id: codeValues.id });

  return inserted[0].id;
}

async function ensureProcedureCatalogEntry(
  tenantId: string,
  codeValueId: string,
  row: (typeof CDT_PROCEDURE_SEED_ROWS)[number]
): Promise<void> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: procedureCatalog.id })
    .from(procedureCatalog)
    .where(
      and(eq(procedureCatalog.tenantId, tenantId), eq(procedureCatalog.codeValueId, codeValueId))
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(procedureCatalog)
      .set({
        procedureType: row.procedureType,
        defaultDurationMin: row.defaultDurationMin,
        requiresTooth: row.requiresTooth,
        requiresSurface: row.requiresSurface,
        isActive: true,
        metadata: { seededFrom: CDT_SEED_VERSION },
        updatedAt: new Date(),
      })
      .where(eq(procedureCatalog.id, existing[0].id));
    return;
  }

  await db.insert(procedureCatalog).values({
    tenantId,
    codeValueId,
    procedureType: row.procedureType,
    defaultDurationMin: row.defaultDurationMin,
    requiresTooth: row.requiresTooth,
    requiresSurface: row.requiresSurface,
    isActive: true,
    metadata: { seededFrom: CDT_SEED_VERSION },
  });
}

/**
 * Idempotent: ensures CDT code system, code values, and procedure_catalog rows exist for a tenant.
 */
export async function ensureCdtReferenceForTenant(tenantId: string): Promise<void> {
  const systemId = await getOrCreateCdtCodeSystem(tenantId);
  for (const row of CDT_PROCEDURE_SEED_ROWS) {
    const codeValueId = await getOrCreateCdtCodeValue(tenantId, systemId, row);
    await ensureProcedureCatalogEntry(tenantId, codeValueId, row);
  }
}

/** Seeds CDT reference data for every active tenant (idempotent). */
export async function ensureCdtReferenceForAllActiveTenants(): Promise<void> {
  const db = createDatabaseConnection();
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'ACTIVE'));
  for (const { id } of rows) {
    await ensureCdtReferenceForTenant(id);
  }
}
