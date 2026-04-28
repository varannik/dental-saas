import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildClinicalServiceServer, getDefaultClinicalServiceConfig } from '../index.js';

describe('clinical/index', () => {
  let app: ReturnType<typeof buildClinicalServiceServer>;

  beforeAll(() => {
    app = buildClinicalServiceServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns default clinical service config', () => {
    const config = getDefaultClinicalServiceConfig();
    expect(config.host).toBeTypeOf('string');
    expect(config.port).toBeTypeOf('number');
  });

  it('returns health without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'clinical' });
  });
});
