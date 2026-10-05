import type { SessionResponse } from '@dental/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from './api';
import { createRefresher } from './refresh';
import { afterError, afterLogin, lockMessage, START } from './sign-in-flow';

const session = (token: string): SessionResponse => ({
  status: 'signed_in',
  accessToken: token,
  tokenType: 'Bearer',
  expiresIn: 600,
  user: { id: 'u', email: 'a@b.test', locale: 'en' },
  clinic: { id: 'c', name: 'Demo' },
  role: 'dentist',
  permissions: [],
  memberships: [],
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('sends credentials, JSON and the CSRF header where needed', async () => {
    const fetcher = vi.fn(async () => json(200, session('t')));
    const api = createApi(fetcher, 'http://api.test');
    await api.login({ email: 'a@b.test', password: 'x' });
    await api.refresh();

    const [loginUrl, loginInit] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(loginUrl).toBe('http://api.test/v1/auth/login');
    expect(loginInit).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(loginInit.headers).toEqual({ 'content-type': 'application/json' });

    const [, refreshInit] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(refreshInit.headers).toEqual({ 'x-requested-with': 'fetch' });
  });

  it('sends the bearer token', async () => {
    const fetcher = vi.fn(async () => json(200, {}));
    await createApi(fetcher, 'http://api.test').me('abc');
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({ authorization: 'Bearer abc' });
  });

  it('turns problem responses and network failures into ApiError', async () => {
    const problem = createApi(
      async () => json(401, { code: 'invalid_credentials', title: 'Nope' }),
      'http://api.test'
    );
    await expect(problem.login({ email: 'a', password: 'b' })).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
      message: 'Nope',
    });

    const offline = createApi(async () => {
      throw new TypeError('Failed to fetch');
    }, 'http://api.test');
    await expect(offline.me('t')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('returns undefined for 204', async () => {
    const api = createApi(async () => new Response(null, { status: 204 }), 'http://api.test');
    await expect(api.logout()).resolves.toBeUndefined();
  });
});

describe('refresher', () => {
  it('shares one refresh between concurrent callers', async () => {
    let calls = 0;
    const refresh = createRefresher(async () => {
      calls += 1;
      await new Promise((done) => setTimeout(done, 10));
      return session(`t${calls}`);
    }, undefined);
    const [a, b, c] = await Promise.all([refresh(), refresh(), refresh()]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    // A later call refreshes again.
    await refresh();
    expect(calls).toBe(2);
  });

  it('retries once when another tab superseded the token', async () => {
    const results: (SessionResponse | ApiError)[] = [
      new ApiError(409, 'refresh_superseded', {}),
      session('fresh'),
    ];
    const wait = vi.fn(async () => undefined);
    const refresh = createRefresher(
      async () => {
        const next = results.shift()!;
        if (next instanceof ApiError) throw next;
        return next;
      },
      undefined,
      wait
    );
    await expect(refresh()).resolves.toMatchObject({ accessToken: 'fresh' });
    expect(wait).toHaveBeenCalledWith(300);
  });

  it('runs inside the cross-tab lock when available', async () => {
    const request = vi.fn(async (_name: string, callback: () => Promise<SessionResponse>) =>
      callback()
    );
    const refresh = createRefresher(async () => session('t'), { request } as never);
    await refresh();
    expect(request).toHaveBeenCalledWith('dental-refresh', expect.any(Function));
  });

  it('passes other errors through', async () => {
    const refresh = createRefresher(async () => {
      throw new ApiError(401, 'unauthenticated', {});
    }, undefined);
    await expect(refresh()).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('sign-in flow', () => {
  it('moves from the password to a session, a code or enrolment', () => {
    expect(afterLogin(session('t'))).toMatchObject({ step: 'done' });
    expect(afterLogin({ status: 'mfa_required', challengeToken: 'c', expiresIn: 300 })).toEqual({
      step: 'code',
      challengeToken: 'c',
    });
    expect(
      afterLogin({
        status: 'mfa_enrollment_required',
        challengeToken: 'c',
        expiresIn: 300,
        secret: 'S',
        otpauthUrl: 'otpauth://x',
      })
    ).toEqual({ step: 'enroll', challengeToken: 'c', secret: 'S', otpauthUrl: 'otpauth://x' });
  });

  it('asks a member of several clinics to choose', () => {
    const clinics = [{ id: '1', name: 'A', role: 'admin' }];
    const error = new ApiError(422, 'clinic_required', { code: 'clinic_required', clinics });
    expect(afterError(error, START)).toEqual({ step: 'clinic', clinics });
  });

  it('keeps the user on the code step for a wrong code', () => {
    const current = { step: 'code', challengeToken: 'c' } as const;
    expect(afterError(new ApiError(401, 'invalid_mfa_code', {}), current)).toMatchObject({
      step: 'code',
      challengeToken: 'c',
      error: expect.stringContaining('not valid'),
    });
  });

  it('starts again when the challenge expired', () => {
    const current = { step: 'code', challengeToken: 'c' } as const;
    expect(afterError(new ApiError(401, 'unauthenticated', {}), current)).toMatchObject({
      step: 'credentials',
      error: expect.stringContaining('took too long'),
    });
  });

  it('explains wrong credentials, lockout, rate limits and network failures', () => {
    expect(afterError(new ApiError(401, 'invalid_credentials', {}), START)).toMatchObject({
      step: 'credentials',
      error: 'The email or password is incorrect.',
    });
    const now = Date.parse('2026-10-05T10:00:00Z');
    expect(lockMessage('2026-10-05T10:04:10Z', now)).toBe(
      'Too many failed attempts. Try again in 5 min.'
    );
    expect(afterError(new ApiError(429, 'rate_limited', {}), START).step).toBe('credentials');
    expect(afterError(new ApiError(0, 'network_error', {}), START)).toMatchObject({
      error: expect.stringContaining('cannot be reached'),
    });
    expect(afterError(new Error('boom'), START)).toMatchObject({
      error: 'Something went wrong. Please try again.',
    });
  });
});
