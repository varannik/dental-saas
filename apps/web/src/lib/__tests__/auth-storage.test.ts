import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const local = new Map<string, string>();

describe('auth-storage', () => {
  beforeEach(() => {
    local.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (local.has(k) ? local.get(k)! : null),
        setItem: (k: string, v: string) => {
          local.set(k, v);
        },
        removeItem: (k: string) => {
          local.delete(k);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('roundtrips tenant id', async () => {
    const { setStoredTenantId, getStoredTenantId } = await import('../auth-storage');
    setStoredTenantId('11111111-1111-4111-8111-111111111111');
    expect(getStoredTenantId()).toBe('11111111-1111-4111-8111-111111111111');
    setStoredTenantId(null);
    expect(getStoredTenantId()).toBe(null);
  });
});
