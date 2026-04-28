import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { registerClinicalApiRoutes } from './routes/index.js';

export function buildClinicalServiceServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'clinical' }));

  void app.register(registerClinicalApiRoutes);

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
