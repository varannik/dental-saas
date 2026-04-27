import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabaseConnection: vi.fn(),
  eq: vi.fn(() => 'eq'),
}));

vi.mock('../../../../packages/config/src/database.js', () => ({
  createDatabaseConnection: mocks.createDatabaseConnection,
}));
vi.mock('drizzle-orm', () => ({
  eq: mocks.eq,
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  })),
}));
vi.mock('../../../../packages/config/src/schema/tenancy.js', () => ({
  tenants: {
    id: 'id',
  },
}));

import { createTenant, getTenantById, listTenants } from '../services/tenant.service.js';

describe('tenant.service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists tenants', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn().mockResolvedValue([{ id: 't1' }]),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const result = await listTenants();
    expect(result).toEqual([{ id: 't1' }]);
  });

  it('creates tenant', async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 't1' }]),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const result = await createTenant({ name: 'Smile', type: 'SOLO_PRACTICE' });
    expect(result).toEqual({ id: 't1' });
  });

  it('gets tenant by id', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 't1' }]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const result = await getTenantById('t1');
    expect(result).toEqual({ id: 't1' });
  });
});
