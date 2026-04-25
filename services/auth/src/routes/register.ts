import type { FastifyPluginAsync } from 'fastify';

import { registerRequestSchema } from '../schemas/register.schema.js';
import { registerUser } from '../services/auth.service.js';

export const registerRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.post('/register', async (request, reply) => {
    const payload = registerRequestSchema.parse(request.body);
    const user = await registerUser(payload);
    return reply.code(201).send({ user });
  });
};
