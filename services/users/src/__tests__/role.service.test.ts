import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabaseConnection: vi.fn(),
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  inArray: vi.fn(() => 'inArray'),
}));

vi.mock('../../../../packages/config/src/database.js', () => ({
  createDatabaseConnection: mocks.createDatabaseConnection,
}));
vi.mock('drizzle-orm', () => ({
  eq: mocks.eq,
  and: mocks.and,
  inArray: mocks.inArray,
}));
vi.mock('../../../../packages/config/src/schema/tenancy.js', () => ({
  roles: {
    id: 'id',
    tenantId: 'tenantId',
  },
  permissions: {
    id: 'id',
    key: 'key',
  },
  rolePermissions: {
    roleId: 'roleId',
    permissionId: 'permissionId',
  },
}));

import { createRole, deleteRole, listRoles } from '../services/role.service.js';

describe('role.service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists roles by tenant', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ id: 'r1' }]),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const result = await listRoles('tenant-1');
    expect(result).toEqual([{ id: 'r1' }]);
  });

  it('creates role and assigns permissions', async () => {
    const db = {
      insert: vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'r1' }]),
          })),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ id: 'p1' }]),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);

    const result = await createRole({
      tenantId: '11111111-1111-4111-8111-111111111111',
      name: 'Manager',
      permissionKeys: ['users.read'],
    });
    expect(result).toEqual({ id: 'r1' });
  });

  it('deletes role and linked permissions', async () => {
    const db = {
      delete: vi
        .fn()
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue(undefined),
        })
        .mockReturnValueOnce({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'r1' }]),
          })),
        }),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);

    const result = await deleteRole('r1', 't1');
    expect(result).toBe(true);
  });
});
