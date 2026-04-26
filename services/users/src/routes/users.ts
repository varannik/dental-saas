import type { FastifyPluginAsync } from 'fastify';

import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from '../schemas/user.schema.js';
import {
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  updateUser,
} from '../services/user.service.js';

export const usersRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.get('/users', async (request, reply) => {
    const query = listUsersQuerySchema.parse(request.query);
    const result = await listUsers(query.tenantId);
    return reply.send({ users: result });
  });

  app.get('/users/:userId', async (request, reply) => {
    const params = userIdParamSchema.parse(request.params);
    const user = await getUserById(params.userId);
    if (!user) return reply.code(404).send({ error: 'User not found.' });
    return reply.send({ user });
  });

  app.post('/users', async (request, reply) => {
    const payload = createUserSchema.parse(request.body);
    const user = await createUser(payload);
    return reply.code(201).send({ user });
  });

  app.patch('/users/:userId', async (request, reply) => {
    const params = userIdParamSchema.parse(request.params);
    const payload = updateUserSchema.parse(request.body);
    const user = await updateUser(params.userId, payload);
    if (!user) return reply.code(404).send({ error: 'User not found.' });
    return reply.send({ user });
  });

  app.delete('/users/:userId', async (request, reply) => {
    const params = userIdParamSchema.parse(request.params);
    const query = listUsersQuerySchema.parse(request.query);
    const deleted = await deleteUser(params.userId, query.tenantId);
    if (!deleted) return reply.code(404).send({ error: 'User not found.' });
    return reply.code(204).send();
  });
};
