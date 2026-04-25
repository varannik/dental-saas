import type { FastifyPluginAsync } from 'fastify';

import { logoutUser } from '../services/auth.service.js';

export const logoutRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.post('/logout', async (request, reply) => {
    const authHeader = request.headers.authorization;
    await logoutUser(authHeader);
    return reply.code(204).send();
  });
};
