import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revokeSession: vi.fn(),
}));

vi.mock('../../../../packages/config/src/database.js', () => ({
  createDatabaseConnection: vi.fn(),
}));
vi.mock('../../../../packages/config/src/schema/tenancy-governance.js', () => ({
  userAuthIdentities: {},
}));
vi.mock('../../../../packages/config/src/schema/tenancy.js', () => ({
  users: {},
  userTenants: {},
}));

vi.mock('../services/session.service.js', () => ({
  createSession: vi.fn(),
  revokeSession: mocks.revokeSession,
}));

import { logoutUser } from '../services/auth.service.js';

describe('auth.service', () => {
  it('delegates logout to session revocation', async () => {
    await logoutUser('Bearer token-123');
    expect(mocks.revokeSession).toHaveBeenCalledWith('Bearer token-123');
  });
});
