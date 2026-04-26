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
  users: {
    id: 'id',
    email: 'email',
    fullName: 'fullName',
    preferredLocale: 'preferredLocale',
    preferredLanguage: 'preferredLanguage',
    status: 'status',
    updatedAt: 'updatedAt',
  },
  userTenants: {
    userId: 'userId',
    tenantId: 'tenantId',
    defaultLocationId: 'defaultLocationId',
    userType: 'userType',
  },
}));

import {
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  updateUser,
} from '../services/user.service.js';

describe('user.service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists all users without tenant filter', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn().mockResolvedValue([{ id: 'u1' }]),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);

    const result = await listUsers();
    expect(result).toEqual([{ id: 'u1' }]);
  });

  it('gets user by id', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 'u1' }]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);

    const result = await getUserById('u1');
    expect(result).toEqual({ id: 'u1' });
  });

  it('creates user and rejects duplicates', async () => {
    const dbDuplicate = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 'existing' }]),
          })),
        })),
      })),
      insert: vi.fn(),
    };
    mocks.createDatabaseConnection.mockReturnValueOnce(dbDuplicate);
    await expect(
      createUser({
        email: 'existing@test.local',
        fullName: 'Existing User',
      })
    ).rejects.toThrow('User with this email already exists.');

    const dbCreated = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      insert: vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'u2', email: 'new@test.local' }]),
          })),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        }),
    };
    mocks.createDatabaseConnection.mockReturnValueOnce(dbCreated);

    const result = await createUser({
      email: 'new@test.local',
      fullName: 'New User',
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result).toEqual({ id: 'u2', email: 'new@test.local' });
  });

  it('updates and deletes users', async () => {
    const dbUpdate = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'u1', fullName: 'Updated' }]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValueOnce(dbUpdate);

    const updated = await updateUser('u1', { fullName: 'Updated' });
    expect(updated).toEqual({ id: 'u1', fullName: 'Updated' });

    const dbDelete = {
      delete: vi
        .fn()
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue(undefined),
        })
        .mockReturnValueOnce({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'u1' }]),
          })),
        }),
    };
    mocks.createDatabaseConnection.mockReturnValueOnce(dbDelete);

    const deleted = await deleteUser('u1', '11111111-1111-4111-8111-111111111111');
    expect(deleted).toBe(true);
  });
});
