import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { problem } from './platform/problems.js';
import { registerVoiceSpike, type VoiceSpikeDeps } from './spikes/voice/route.js';

export interface ServerOptions {
  logger?: boolean | { level: string };
  corsOrigin?: string;
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

  await app.register(helmet);
  await app.register(cors, {
    origin: options.corsOrigin ?? 'http://localhost:3000',
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ok' }));

  if (options.voiceSpike) {
    await app.register(websocket);
    await registerVoiceSpike(app, options.voiceSpike);
  }

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
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
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

  return app;
}
