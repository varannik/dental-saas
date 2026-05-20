'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export type TenantSummary = {
  id: string;
  name: string;
  type: string;
  status: string;
};

async function fetchTenant(
  accessToken: string | null,
  tenantId: string | null
): Promise<TenantSummary | null> {
  if (!accessToken || !tenantId) {
    return null;
  }
  const res = await apiFetch(`/api/v1/tenants/${tenantId}`, { accessToken });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Tenant request failed (${res.status})`);
  }
  const body = (await res.json()) as { tenant?: TenantSummary };
  return body.tenant ?? null;
}

/** Active organization from the users service (JWT `tenantId` must match). */
export function useActiveTenant() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);

  return useQuery({
    queryKey: ['tenant', 'active', tenantId],
    queryFn: () => fetchTenant(accessToken, tenantId),
    enabled: Boolean(accessToken && tenantId),
  });
}
