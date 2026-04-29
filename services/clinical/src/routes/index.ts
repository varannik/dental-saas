import type { FastifyInstance } from 'fastify';

import { requireClinicalPreHandler } from '../middleware/auth-context.js';
import { encountersRoute } from './encounters.js';
import { clinicalNotesByIdRoute } from './notes.js';
import { patientsRoute } from './patients.js';

export async function registerClinicalApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (instance) => {
    instance.addHook('preHandler', requireClinicalPreHandler);
    await instance.register(patientsRoute, { prefix: '/patients' });
    await instance.register(encountersRoute, { prefix: '/encounters' });
    await instance.register(clinicalNotesByIdRoute, { prefix: '/notes' });
  });
}
