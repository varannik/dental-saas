import type { FastifyPluginAsync } from 'fastify';

import { listActiveSessions } from '../services/session.service.js';

export const sessionsRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.get('/sessions', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const sessions = await listActiveSessions(authHeader);
    return reply.send({ sessions });
  });
};
