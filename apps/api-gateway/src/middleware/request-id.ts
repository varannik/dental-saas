import type { FastifyPluginAsync } from 'fastify';

export const requestIdMiddleware: FastifyPluginAsync = async (app): Promise<void> => {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : request.id;
    reply.header('x-request-id', requestId);
  });
};
