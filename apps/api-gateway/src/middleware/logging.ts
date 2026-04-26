import type { FastifyPluginAsync } from 'fastify';

export const loggingMiddleware: FastifyPluginAsync = async (app): Promise<void> => {
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
      },
      'Gateway request completed'
    );
  });
};
