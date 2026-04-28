import type { FastifyInstance } from 'fastify';

import { requireClinicalPreHandler } from '../middleware/auth-context.js';
import { patientsRoute } from './patients.js';

export async function registerClinicalApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (instance) => {
    instance.addHook('preHandler', requireClinicalPreHandler);
    await instance.register(patientsRoute, { prefix: '/patients' });
  });
}
