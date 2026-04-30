import Fastify, { type FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';

import { registerAuthErrorHandler } from './lib/error-response.js';
import { registerAuthRoutes } from './routes/index.js';

export interface AuthServiceConfig {
  serviceName: string;
  host: string;
  port: number;
}

export function getDefaultAuthConfig(): AuthServiceConfig {
  return {
    serviceName: 'auth-service',
    host: process.env.AUTH_HOST ?? '0.0.0.0',
    port: Number.parseInt(process.env.AUTH_PORT ?? '4001', 10),
  };
}

export async function buildServer(
  config: AuthServiceConfig = getDefaultAuthConfig()
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  registerAuthErrorHandler(app);
  await app.register(registerAuthRoutes, { prefix: '/auth' });
  await app.ready();
  app.log.info({ service: config.serviceName }, 'Auth service initialized');
  return app;
}

export async function startServer(
  config: AuthServiceConfig = getDefaultAuthConfig()
): Promise<void> {
  const app = await buildServer(config);
  await app.listen({ host: config.host, port: config.port });
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectRun) {
  startServer().catch((error: unknown) => {
    console.error('Auth service failed to start:', error);
    process.exit(1);
  });
}
