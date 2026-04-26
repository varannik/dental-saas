import type { FastifyPluginAsync } from 'fastify';

import { locationsRoute } from './locations.js';
import { rolesRoute } from './roles.js';
import { tenantsRoute } from './tenants.js';
import { usersRoute } from './users.js';

export const registerUserServiceRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  await app.register(usersRoute);
  await app.register(tenantsRoute);
  await app.register(locationsRoute);
  await app.register(rolesRoute);
};
