import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEMO_TENANT_ID, getDefaultTenantId } from '../constants';

describe('getDefaultTenantId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns DEMO_TENANT_ID when env is empty', () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_TENANT_ID', '');
    expect(getDefaultTenantId()).toBe(DEMO_TENANT_ID);
  });

  it('trims NEXT_PUBLIC_DEFAULT_TENANT_ID when set', () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_TENANT_ID', '  22222222-2222-4222-8222-222222222222  ');
    expect(getDefaultTenantId()).toBe('22222222-2222-4222-8222-222222222222');
  });
});
