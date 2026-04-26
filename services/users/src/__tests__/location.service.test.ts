import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabaseConnection: vi.fn(),
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}));

vi.mock('../../../../packages/config/src/database.js', () => ({
  createDatabaseConnection: mocks.createDatabaseConnection,
}));
vi.mock('drizzle-orm', () => ({
  eq: mocks.eq,
  and: mocks.and,
}));
vi.mock('../../../../packages/config/src/schema/tenancy.js', () => ({
  locations: {
    id: 'id',
    tenantId: 'tenantId',
  },
}));

import { createLocation, deleteLocation, listLocations } from '../services/location.service.js';

describe('location.service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists locations by tenant', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ id: 'l1' }]),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const result = await listLocations('tenant-1');
    expect(result).toEqual([{ id: 'l1' }]);
  });

  it('creates location', async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'l1' }]),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const result = await createLocation({
      tenantId: '11111111-1111-4111-8111-111111111111',
      name: 'Main Branch',
    });
    expect(result).toEqual({ id: 'l1' });
  });

  it('deletes location', async () => {
    const db = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'l1' }]),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const result = await deleteLocation('l1', 't1');
    expect(result).toBe(true);
  });
});
