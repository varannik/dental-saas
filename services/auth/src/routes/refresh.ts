import type { FastifyPluginAsync } from 'fastify';

import { refreshTokenSchema } from '../schemas/common.schema.js';
import { refreshSession } from '../services/token.service.js';

export const refreshRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.post('/refresh', async (request, reply) => {
    const payload = refreshTokenSchema.parse(request.body);
    const tokenSet = await refreshSession(payload.refreshToken);
    return reply.send(tokenSet);
  });
};
