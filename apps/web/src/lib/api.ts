import {
  CSRF_HEADER,
  type LoginResponse,
  type MeResponse,
  type SessionResponse,
} from '@dental/contracts';

/**
 * A small typed client for the API. Clinical data goes from the browser to the API origin
 * directly, never through Vercel functions (spec section A). Requests include credentials so
 * the httpOnly refresh cookie travels with the auth calls.
 *
 * The spec's client generated from OpenAPI replaces this once the API publishes its contract.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** A problem response from the API (RFC 9457), or a network failure with status 0. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown>
  ) {
    super(typeof body.title === 'string' ? body.title : code);
    this.name = 'ApiError';
  }
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  token?: string;
  /** The cookie endpoints require the CSRF header. */
  csrf?: boolean;
}

export type Fetcher = typeof fetch;

export function createApi(fetcher: Fetcher = (...args) => fetch(...args), baseUrl = API_URL) {
  async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.csrf) headers[CSRF_HEADER] = 'fetch';

    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'include',
      });
    } catch {
      throw new ApiError(0, 'network_error', {});
    }
    if (response.status === 204) return undefined as T;
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = typeof data?.code === 'string' ? data.code : 'internal_error';
      throw new ApiError(response.status, code, data ?? {});
    }
    return data as T;
  }

  return {
    login: (body: { email: string; password: string; clinicId?: string }) =>
      call<LoginResponse>('/v1/auth/login', { method: 'POST', body }),
    verifyMfa: (body: { challengeToken: string; code: string }) =>
      call<SessionResponse>('/v1/auth/mfa/verify', { method: 'POST', body }),
    refresh: () => call<SessionResponse>('/v1/auth/refresh', { method: 'POST', csrf: true }),
    logout: () => call<void>('/v1/auth/logout', { method: 'POST', csrf: true }),
    me: (token: string) => call<MeResponse>('/v1/me', { token }),
  };
}

export type Api = ReturnType<typeof createApi>;

export const api = createApi();
