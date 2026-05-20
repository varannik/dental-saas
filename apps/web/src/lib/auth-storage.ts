const ACCESS_TOKEN_KEY = 'dental-saas-access-token';
const TENANT_ID_KEY = 'dental-saas-active-tenant-id';

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredTenantId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(TENANT_ID_KEY);
}

export function setStoredAccessToken(token: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (token === null) {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function setStoredTenantId(tenantId: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (tenantId === null || tenantId === '') {
    window.localStorage.removeItem(TENANT_ID_KEY);
    return;
  }
  window.localStorage.setItem(TENANT_ID_KEY, tenantId);
}
