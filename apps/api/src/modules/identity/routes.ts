import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../platform/auth.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { IdentityService, LoginResult, SessionResult } from './service.js';
import type { TokenService } from './tokens.js';

/**
 * POST /v1/auth/login, /mfa/verify, /refresh, /logout and GET /v1/me.
 *
 * Login answers with status "signed_in", or with "mfa_required" or "mfa_enrollment_required"
 * and a challenge token that /mfa/verify exchanges, with a TOTP code, for a session.
 *
 * The refresh token lives only in an httpOnly cookie scoped to /v1/auth. The cookie endpoints
 * also require the X-Requested-With header: a cross-site form cannot send it, and CORS only
 * lets the web app's origin send it from script.
 */

export const REFRESH_COOKIE = 'dental_refresh';
export const CSRF_HEADER = 'x-requested-with';

export interface IdentityRouteOptions {
  service: IdentityService;
  tokens: TokenService;
  cookie: { secure: boolean; sameSite: 'lax' | 'strict' | 'none' };
  /** Sign-in attempts per IP address per minute. */
  loginRateLimit?: number;
}

const loginBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
  clinicId: z.string().uuid().optional(),
});

const mfaBody = z.object({
  challengeToken: z.string().min(1).max(2048),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpProblem(400, 'validation_failed', 'The request is not valid.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

function requireCsrfHeader(request: FastifyRequest) {
  if (!request.headers[CSRF_HEADER]) {
    throw new HttpProblem(403, 'forbidden', `The ${CSRF_HEADER} header is required.`);
  }
}

function sessionBody(result: SessionResult) {
  return {
    status: 'signed_in',
    accessToken: result.accessToken,
    tokenType: 'Bearer',
    expiresIn: result.expiresIn,
    user: result.user,
    clinic: result.clinic,
    role: result.role,
    permissions: result.permissions,
    memberships: result.memberships,
  };
}

export async function registerIdentityRoutes(app: FastifyInstance, options: IdentityRouteOptions) {
  const { service, tokens, cookie } = options;
  const cookieOptions = {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: '/v1/auth',
  } as const;

  const setRefreshCookie = (reply: FastifyReply, result: SessionResult) =>
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions,
      expires: result.refreshExpiresAt,
    });

  app.post(
    '/v1/auth/login',
    { config: { rateLimit: { max: options.loginRateLimit ?? 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parse(loginBody, request.body);
      const result: LoginResult = await service.login({
        ...body,
        device: request.headers['user-agent'],
      });
      if (result.status !== 'signed_in') return result;
      setRefreshCookie(reply, result);
      return sessionBody(result);
    }
  );

  app.post(
    '/v1/auth/mfa/verify',
    { config: { rateLimit: { max: options.loginRateLimit ?? 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parse(mfaBody, request.body);
      const result = await service.verifyMfa({ ...body, device: request.headers['user-agent'] });
      setRefreshCookie(reply, result);
      return sessionBody(result);
    }
  );

  app.post(
    '/v1/auth/refresh',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      requireCsrfHeader(request);
      const token = request.cookies[REFRESH_COOKIE];
      if (!token) throw new HttpProblem(401, 'unauthenticated', 'Sign in to continue.');
      try {
        const result = await service.refresh(token, request.headers['user-agent']);
        setRefreshCookie(reply, result);
        return sessionBody(result);
      } catch (error) {
        reply.clearCookie(REFRESH_COOKIE, cookieOptions);
        throw error;
      }
    }
  );

  app.post('/v1/auth/logout', async (request, reply) => {
    requireCsrfHeader(request);
    const token = request.cookies[REFRESH_COOKIE];
    if (token) await service.logout(token);
    reply.clearCookie(REFRESH_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  app.get('/v1/me', { preHandler: authenticate(tokens) }, async (request) =>
    service.me(request.auth!)
  );
}
