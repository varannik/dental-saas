import { Client } from 'pg';

import { getEnv } from '@saas/config';
import jwt from 'jsonwebtoken';

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/dental_saas';

/** Matches deterministic demo tenant used in seed + auth integration tests. */
export const DEMO_TENANT_ID = process.env.TEST_TENANT_ID ?? '11111111-1111-4111-8111-111111111111';

/** Used only when no seeded user exists for the demo tenant (FK target for clinical writes). */
const SYNTHETIC_PROVIDER_USER_ID =
  process.env.CLINICAL_WORKFLOW_USER_ID ?? '33333333-3333-4333-8333-333333333333';

function getDatabaseUrl(): string {
  try {
    return getEnv().DATABASE_URL;
  } catch {
    return process.env.DATABASE_URL?.trim() || DEFAULT_DB_URL;
  }
}

export function assertInjectStatus(
  response: { statusCode: number; body: string },
  expectedStatus: number,
  context: string
): void {
  if (response.statusCode === expectedStatus) return;
  let body = response.body;
  try {
    body = JSON.stringify(JSON.parse(response.body) as unknown, null, 2);
  } catch {
    /* keep raw */
  }
  throw new Error(
    `${context}: expected HTTP ${expectedStatus}, got ${response.statusCode}.\nResponse body:\n${body}`
  );
}

export async function assertClinicalIntegrationDatabaseReady(): Promise<void> {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query<{ ok: boolean }>(
      `
      select (
        exists (
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = 'patients'
        )
        and exists (
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = 'encounters'
        )
        and exists (
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = 'clinical_notes'
        )
        and exists (
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = 'dental_chart_entries'
        )
        and exists (
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = 'treatment_plans'
        )
      ) as ok
      `
    );
    if (result.rows[0]?.ok !== true) {
      throw new Error(
        'Clinical integration DB check failed: expected public.patients, encounters, clinical_notes, dental_chart_entries, and treatment_plans. Apply Phase 2 migrations (e.g. `pnpm exec drizzle-kit migrate` from repo root with the same DATABASE_URL as this test process).'
      );
    }
  } finally {
    await client.end();
  }
}

export function issueClinicalAccessToken(params: { userId: string; tenantId: string }): string {
  const secret = process.env.JWT_SECRET?.trim() || 'dev-only-jwt-secret-change-me-immediately';
  const issuer = process.env.JWT_ISSUER ?? 'dental-saas';
  return jwt.sign({ userId: params.userId, tenantId: params.tenantId }, secret, {
    issuer,
  });
}

export interface ClinicalIntegrationPrimaries {
  locationId: string;
  userId: string;
}

/**
 * Ensures demo tenant, at least one location, and a provider user exist (idempotent).
 */
export async function ensureClinicalWorkflowPrimaries(
  tenantId: string
): Promise<ClinicalIntegrationPrimaries> {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  try {
    await client.query(
      `
      insert into tenants (
        id,
        name,
        type,
        primary_region,
        default_locale,
        supported_locales,
        supported_languages,
        partition_strategy,
        status
      )
      values (
        $1,
        'Demo Dental Practice',
        'SOLO_PRACTICE',
        'eu-central-1',
        'en-US',
        '["en-US"]'::jsonb,
        '["en"]'::jsonb,
        'ROW_LEVEL',
        'ACTIVE'
      )
      on conflict (id) do update set
        name = excluded.name,
        type = excluded.type,
        updated_at = now()
      `,
      [tenantId]
    );

    const existingLoc = await client.query<{ id: string }>(
      `select id from locations where tenant_id = $1 limit 1`,
      [tenantId]
    );
    let locationId = existingLoc.rows[0]?.id;
    if (!locationId) {
      const ins = await client.query<{ id: string }>(
        `
        insert into locations (tenant_id, name, timezone, status, address)
        values ($1, 'Clinical Integration Clinic', 'UTC', 'ACTIVE', '{}'::jsonb)
        returning id
        `,
        [tenantId]
      );
      locationId = ins.rows[0].id;
    }

    const tenantUser = await client.query<{ id: string }>(
      `
      select u.id
      from users u
      inner join user_tenants ut on ut.user_id = u.id
      where ut.tenant_id = $1
      limit 1
      `,
      [tenantId]
    );

    let userId = tenantUser.rows[0]?.id;
    if (!userId) {
      await client.query(
        `
        insert into users (id, email, full_name, status)
        values ($1, $2, 'Clinical Workflow Integration User', 'ACTIVE')
        on conflict (id) do update set
          email = excluded.email,
          full_name = excluded.full_name,
          updated_at = now()
        `,
        [SYNTHETIC_PROVIDER_USER_ID, 'clinical.workflow.itest@example.local']
      );
      await client.query(
        `
        insert into user_tenants (user_id, tenant_id, default_location_id, user_type)
        values ($1, $2, $3, 'DENTIST')
        on conflict (user_id, tenant_id) do update set
          default_location_id = excluded.default_location_id,
          updated_at = now()
        `,
        [SYNTHETIC_PROVIDER_USER_ID, tenantId, locationId]
      );
      userId = SYNTHETIC_PROVIDER_USER_ID;
    }

    return { locationId, userId };
  } finally {
    await client.end();
  }
}
