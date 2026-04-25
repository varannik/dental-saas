import type { FastifyPluginAsync } from 'fastify';

import { getCurrentSessionUser } from '../services/session.service.js';

export const meRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.get('/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const me = await getCurrentSessionUser(authHeader);
    return reply.send({ user: me });
  });
};
