import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';

import { verifyAccessTokenFromAuthorizationHeader } from '../lib/verify-access-token.js';
import { createTenantSchema } from '../schemas/tenant.schema.js';
import {
  createTenant,
  createTenantWithCreatorAsAdmin,
  getTenantById,
  listTenants,
} from '../services/tenant.service.js';

const tenantIdParamSchema = z.object({
  tenantId: z.string().uuid(),
});

export const tenantsRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.post('/tenants/with-membership', async (request, reply) => {
    const claims = verifyAccessTokenFromAuthorizationHeader(request.headers.authorization);
    if (!claims) {
      return reply.code(401).send({ error: 'Unauthorized.' });
    }
    const payload = createTenantSchema.parse(request.body);
    const tenant = await createTenantWithCreatorAsAdmin(claims.userId, payload);
    return reply.code(201).send({ tenant });
  });

  app.get('/tenants', async (_request, reply) => {
    const result = await listTenants();
    return reply.send({ tenants: result });
  });

  app.get('/tenants/:tenantId', async (request, reply) => {
    const params = tenantIdParamSchema.parse(request.params);
    const tenant = await getTenantById(params.tenantId);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found.' });
    return reply.send({ tenant });
  });

  app.post('/tenants', async (request, reply) => {
    const payload = createTenantSchema.parse(request.body);
    const tenant = await createTenant(payload);
    return reply.code(201).send({ tenant });
  });
};
