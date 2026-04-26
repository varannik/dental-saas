import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';

import { createLocationSchema, listLocationsQuerySchema } from '../schemas/location.schema.js';
import { createLocation, deleteLocation, listLocations } from '../services/location.service.js';

const locationIdParamSchema = z.object({
  locationId: z.string().uuid(),
});

export const locationsRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.get('/locations', async (request, reply) => {
    const query = listLocationsQuerySchema.parse(request.query);
    const result = await listLocations(query.tenantId);
    return reply.send({ locations: result });
  });

  app.post('/locations', async (request, reply) => {
    const payload = createLocationSchema.parse(request.body);
    const location = await createLocation(payload);
    return reply.code(201).send({ location });
  });

  app.delete('/locations/:locationId', async (request, reply) => {
    const params = locationIdParamSchema.parse(request.params);
    const query = listLocationsQuerySchema.parse(request.query);
    const deleted = await deleteLocation(params.locationId, query.tenantId);
    if (!deleted) return reply.code(404).send({ error: 'Location not found.' });
    return reply.code(204).send();
  });
};
