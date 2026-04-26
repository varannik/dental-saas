import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { registerUserServiceRoutes } from './routes/index.js';

export interface UsersServiceConfig {
  host: string;
  port: number;
}

export function getDefaultUsersServiceConfig(): UsersServiceConfig {
  return {
    host: process.env.USERS_HOST ?? '0.0.0.0',
    port: Number(process.env.USERS_PORT ?? 4002),
  };
}

export async function buildUsersServiceServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'users' }));
  await app.register(registerUserServiceRoutes);

  app.setErrorHandler(
    (error: unknown, _request: FastifyRequest, reply: FastifyReply): FastifyReply => {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: 'Validation failed.',
          details: error.flatten(),
        });
      }

      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode) || 500
          : 500;
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Unexpected error';

      return reply.code(statusCode).send({ error: message });
    }
  );

  return app;
}

async function start(): Promise<void> {
  const app = await buildUsersServiceServer();
  const config = getDefaultUsersServiceConfig();
  await app.listen({ host: config.host, port: config.port });
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((error: unknown) => {
    console.error('Failed to start users service.', error);
    process.exit(1);
  });
}
