import type { FastifyInstance } from 'fastify';

import { requireClinicalPreHandler } from '../middleware/auth-context.js';
import { chartEntriesRoute } from './chart-entries.js';
import { encountersRoute } from './encounters.js';
import { clinicalNotesByIdRoute } from './notes.js';
import { patientsRoute } from './patients.js';
import { treatmentPlansDetailRoute } from './treatment-plans.js';

export async function registerClinicalApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (instance) => {
    instance.addHook('preHandler', requireClinicalPreHandler);
    await instance.register(patientsRoute, { prefix: '/patients' });
    await instance.register(encountersRoute, { prefix: '/encounters' });
    await instance.register(clinicalNotesByIdRoute, { prefix: '/notes' });
    await instance.register(chartEntriesRoute, { prefix: '/chart-entries' });
    await instance.register(treatmentPlansDetailRoute, { prefix: '/treatment-plans' });
  });
}
