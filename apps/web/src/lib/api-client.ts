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
};

/**
 * Fetch against the API gateway. Pass path like `/api/v1/patients` (leading slash optional).
 */
export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { accessToken, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (rest.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${getApiBaseUrl()}${normalized}`, {
    ...rest,
    headers,
  });
}
