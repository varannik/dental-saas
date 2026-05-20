export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_GATEWAY_URL;
  let url =
    raw && raw.length > 0 ? raw : /* local default matches dev gateway */ 'http://localhost:4000';
  url = url.replace(/\/$/, '');
  // Paths already include `/api/v1/...`; strip accidental `/api` or `/api/v1` suffix from env.
  url = url.replace(/\/api\/v1$/i, '').replace(/\/api$/i, '');
  return url.replace(/\/$/, '');
}

export type ApiFetchInit = RequestInit & {
  accessToken?: string | null;
  /** When true, 401 does not clear the client session (e.g. probing /auth/me). */
  skipSessionClearOn401?: boolean;
};

/**
 * Fetch against the API gateway. Pass path like `/api/v1/patients` (leading slash optional).
 * Authenticated requests that return 401 clear the session unless `skipSessionClearOn401` is set.
 */
export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { accessToken, skipSessionClearOn401, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (rest.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${getApiBaseUrl()}${normalized}`, {
    ...rest,
    headers,
  });

  if (res.status === 401 && accessToken && !skipSessionClearOn401) {
    const { useAuthStore } = await import('@/stores/auth.store');
    useAuthStore.getState().clearSession();
  }

  return res;
}
