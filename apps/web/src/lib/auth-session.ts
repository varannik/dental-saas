import { apiFetch } from '@/lib/api-client';
import { getDefaultTenantId } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth.store';

export type AuthMeUser = {
  userId: string;
  tenantId: string;
};

export async function fetchAuthMe(accessToken: string): Promise<AuthMeUser | null> {
  const res = await apiFetch('/api/v1/auth/me', {
    accessToken,
    skipSessionClearOn401: true,
  });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { user?: { userId?: string; tenantId?: string } };
  const u = body.user;
  if (typeof u?.userId !== 'string' || typeof u?.tenantId !== 'string') {
    return null;
  }
  return { userId: u.userId, tenantId: u.tenantId };
}

/** Persists token + tenant from `/auth/me` (JWT truth); falls back if `/me` unavailable. */
export async function establishSessionFromAccessToken(
  accessToken: string,
  fallbackTenantId: string = getDefaultTenantId()
): Promise<void> {
  const me = await fetchAuthMe(accessToken);
  const tenantId = me?.tenantId ?? fallbackTenantId;
  useAuthStore.getState().setSession(accessToken, tenantId);
}

/** Login with password for a tenant (e.g. after creating a new org). */
export async function loginWithPasswordForTenant(
  email: string,
  password: string,
  tenantId: string
): Promise<{ accessToken: string } | null> {
  const res = await apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password, tenantId }),
  });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { accessToken?: string };
  if (typeof body.accessToken !== 'string') {
    return null;
  }
  return { accessToken: body.accessToken };
}
