import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { CSRF_HEADER, registerIdentityRoutes } from './modules/identity/routes.js';
import type { IdentityService } from './modules/identity/service.js';
import type { TokenService } from './modules/identity/tokens.js';
import type { Pool } from './platform/db.js';
import { HttpProblem } from './platform/http-problem.js';
import { problem } from './platform/problems.js';
import { registerVoiceSpike, type VoiceSpikeDeps } from './spikes/voice/route.js';

export interface IdentityDeps {
  pool: Pool;
  service: IdentityService;
  tokens: TokenService;
  cookie: { secure: boolean; sameSite: 'lax' | 'strict' | 'none' };
  loginRateLimit?: number;
}

export interface ServerOptions {
  logger?: boolean | { level: string };
  corsOrigin?: string;
  /** Registers sign-in and the routes that need the database when set. */
  identity?: IdentityDeps;
  /** Registers the development-only voice spike endpoint when set. */
  voiceSpike?: VoiceSpikeDeps;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      return typeof header === 'string' && header.length > 0 ? header : crypto.randomUUID();
    },
    requestIdHeader: 'x-request-id',
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .type('application/problem+json')
      .send(
        problem({
          status: 404,
          title: 'Not found',
          instance: request.url,
          requestId: request.id,
        })
      );
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpProblem) {
      reply
        .status(error.statusCode)
        .headers(error.headers)
        .type('application/problem+json')
        .send({
          ...problem({
            status: error.statusCode,
            code: error.code,
            title: error.title,
            instance: request.url,
            requestId: request.id,
          }),
          ...error.extra,
        });
      return;
    }
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode >= 500) request.log.error({ err: error }, 'request failed');
    const message = error instanceof Error ? error.message : 'Internal server error';
    const title = statusCode === 500 ? 'Internal server error' : message;
    reply
      .status(statusCode)
      .type('application/problem+json')
      .send(
        problem({
          status: statusCode,
          title,
          detail: statusCode === 500 ? undefined : message,
          instance: request.url,
          requestId: request.id,
        })
      );
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: options.corsOrigin ?? 'http://localhost:3000',
    // The refresh cookie travels with credentialed requests from the web app only.
    credentials: true,
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', CSRF_HEADER],
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(cookie);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (request, reply) => {
    if (options.identity) {
      try {
        await options.identity.pool.query('SELECT 1');
      } catch (error) {
        request.log.warn({ err: error }, 'database not ready');
        return reply.status(503).send({ status: 'unavailable', database: 'down' });
      }
    }
    return { status: 'ok' };
  });

  if (options.identity) {
    await registerIdentityRoutes(app, options.identity);
  }

  if (options.voiceSpike) {
    await app.register(websocket);
    await registerVoiceSpike(app, options.voiceSpike);
  }

  return app;
}
