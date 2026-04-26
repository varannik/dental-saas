import Fastify, { type FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';

import { loggingMiddleware } from './middleware/logging.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { tenantResolverMiddleware } from './middleware/tenant-resolver.js';
import { authPlugin } from './plugins/auth.js';
import { corsPlugin } from './plugins/cors.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { websocketPlugin } from './plugins/websocket.js';
import { authProxyRoute } from './routes/auth.proxy.js';
import { patientsProxyRoute } from './routes/patients.proxy.js';
import { usersProxyRoute } from './routes/users.proxy.js';
import { voiceProxyRoute } from './routes/voice.proxy.js';

export interface ApiGatewayConfig {
  serviceName: string;
  host: string;
  port: number;
}

export function getDefaultGatewayConfig(): ApiGatewayConfig {
  return {
    serviceName: 'api-gateway',
    host: process.env.GATEWAY_HOST ?? '0.0.0.0',
    port: Number.parseInt(process.env.GATEWAY_PORT ?? '4000', 10),
  };
}

export async function buildServer(
  config: ApiGatewayConfig = getDefaultGatewayConfig()
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCodeRaw =
      typeof (error as Error & { statusCode?: number }).statusCode === 'number'
        ? (error as Error & { statusCode?: number }).statusCode
        : undefined;
    const statusCode = statusCodeRaw ?? 500;
    const message = error instanceof Error ? error.message : 'Unexpected gateway error';
    request.log.error({ error }, 'Gateway request failed');
    reply.code(statusCode).send({
      error: message,
    });
  });

  await app.register(requestIdMiddleware);
  await app.register(loggingMiddleware);
  await app.register(corsPlugin);
  await app.register(websocketPlugin);
  await app.register(tenantResolverMiddleware);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);

  app.get('/health', async () => ({
    status: 'ok',
    service: config.serviceName,
  }));

  await app.register(
    async (api) => {
      await api.register(authProxyRoute);
      await api.register(usersProxyRoute);
      await api.register(patientsProxyRoute);
      await api.register(voiceProxyRoute);
    },
    { prefix: '/api/v1' }
  );

  await app.ready();
  app.log.info({ service: config.serviceName }, 'API gateway initialized');
  return app;
}

export async function startServer(
  config: ApiGatewayConfig = getDefaultGatewayConfig()
): Promise<void> {
  const app = await buildServer(config);
  await app.listen({ host: config.host, port: config.port });
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectRun) {
  startServer().catch((error: unknown) => {
    console.error('API gateway failed to start:', error);
    process.exit(1);
  });
}
