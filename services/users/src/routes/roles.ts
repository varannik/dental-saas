import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';

import { createRoleSchema, listRolesQuerySchema } from '../schemas/role.schema.js';
import { createRole, deleteRole, listRoles } from '../services/role.service.js';

const roleIdParamSchema = z.object({
  roleId: z.string().uuid(),
});

export const rolesRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.get('/roles', async (request, reply) => {
    const query = listRolesQuerySchema.parse(request.query);
    const result = await listRoles(query.tenantId);
    return reply.send({ roles: result });
  });

  app.post('/roles', async (request, reply) => {
    const payload = createRoleSchema.parse(request.body);
    const role = await createRole(payload);
    return reply.code(201).send({ role });
  });

  app.delete('/roles/:roleId', async (request, reply) => {
    const params = roleIdParamSchema.parse(request.params);
    const query = listRolesQuerySchema.parse(request.query);
    const deleted = await deleteRole(params.roleId, query.tenantId);
    if (!deleted) return reply.code(404).send({ error: 'Role not found.' });
    return reply.code(204).send();
  });
};
