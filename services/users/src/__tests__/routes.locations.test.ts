import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listLocations: vi.fn(),
  createLocation: vi.fn(),
  deleteLocation: vi.fn(),
}));

vi.mock('../services/location.service.js', () => ({
  listLocations: mocks.listLocations,
  createLocation: mocks.createLocation,
  deleteLocation: mocks.deleteLocation,
}));

import { locationsRoute } from '../routes/locations.js';

describe('routes/locations', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists locations', async () => {
    mocks.listLocations.mockResolvedValue([{ id: 'l1' }]);
    const app = Fastify();
    await app.register(locationsRoute);

    const response = await app.inject({
      method: 'GET',
      url: '/locations?tenantId=11111111-1111-4111-8111-111111111111',
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('creates location and validates payload', async () => {
    mocks.createLocation.mockResolvedValue({ id: 'l1' });
    const app = Fastify();
    await app.register(locationsRoute);

    let response = await app.inject({
      method: 'POST',
      url: '/locations',
      payload: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        name: 'Main Branch',
      },
    });
    expect(response.statusCode).toBe(201);

    response = await app.inject({
      method: 'POST',
      url: '/locations',
      payload: {
        tenantId: 'not-uuid',
        name: '',
      },
    });
    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it('deletes location and handles not found', async () => {
    const app = Fastify();
    await app.register(locationsRoute);

    mocks.deleteLocation.mockResolvedValueOnce(true);
    let response = await app.inject({
      method: 'DELETE',
      url: '/locations/11111111-1111-4111-8111-111111111111?tenantId=11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(204);

    mocks.deleteLocation.mockResolvedValueOnce(false);
    response = await app.inject({
      method: 'DELETE',
      url: '/locations/11111111-1111-4111-8111-111111111111?tenantId=11111111-1111-4111-8111-111111111111',
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
