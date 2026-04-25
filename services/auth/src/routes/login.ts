import type { FastifyPluginAsync } from 'fastify';

import { loginRequestSchema } from '../schemas/login.schema.js';
import { loginUser } from '../services/auth.service.js';

export const loginRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.post('/login', async (request, reply) => {
    const payload = loginRequestSchema.parse(request.body);
    const session = await loginUser(payload);
    return reply.send(session);
  });
};
