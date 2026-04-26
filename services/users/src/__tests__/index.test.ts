import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabaseConnection: vi.fn(),
}));

vi.mock('../../../../packages/config/src/database.js', () => ({
  createDatabaseConnection: mocks.createDatabaseConnection,
}));

import { buildUsersServiceServer, getDefaultUsersServiceConfig } from '../index.js';

describe('users/index', () => {
  let app: Awaited<ReturnType<typeof buildUsersServiceServer>>;

  beforeAll(async () => {
    app = await buildUsersServiceServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns default users service config', () => {
    const config = getDefaultUsersServiceConfig();
    expect(config.host).toBeTypeOf('string');
    expect(config.port).toBeTypeOf('number');
  });

  it('returns health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'users' });
  });

  it('returns validation error response for invalid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'invalid-email',
        fullName: '',
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: 'Internal Server Error',
    });
  });

  it('returns 500 when service throws unknown error', async () => {
    mocks.createDatabaseConnection.mockImplementation(() => {
      throw new Error('database unavailable');
    });

    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'user@test.local',
        fullName: 'User Test',
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'database unavailable',
    });
  });
});
