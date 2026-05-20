/** Matches seeded demo tenant in `scripts/database/seed.sh` and integration tests. */
export const DEMO_TENANT_ID = '11111111-1111-4111-8111-111111111111';

/** Bootstrap tenant for register/login when `NEXT_PUBLIC_DEFAULT_TENANT_ID` is unset. */
export function getDefaultTenantId(): string {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv.trim();
  }
  return DEMO_TENANT_ID;
}

/** Safe UUID for layout-only encounter route; replace with real ids from the API. */
export const SAMPLE_ENCOUNTER_ID = '00000000-0000-4000-8000-000000000001';
