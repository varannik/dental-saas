import { afterEach, describe, expect, it, vi } from 'vitest';

import { issueTokenPair, refreshSession, verifyAccessToken } from '../services/token.service.js';

describe('token.service', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('issues valid access and refresh tokens', async () => {
    vi.stubEnv('JWT_SECRET', 'a-secure-secret-key-with-more-than-thirty-two-chars');
    vi.stubEnv('JWT_ISSUER', 'dental-saas-tests');

    const pair = await issueTokenPair({
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      roles: ['ADMIN'],
      permissions: ['users:manage'],
    });

    expect(pair.accessToken).toBeTypeOf('string');
    expect(pair.refreshToken).toBeTypeOf('string');

    const accessClaims = verifyAccessToken(pair.accessToken);
    expect(accessClaims.userId).toBe('user-1');
    expect(accessClaims.tenantId).toBe('tenant-1');
    expect(accessClaims.sessionId).toBe('session-1');
    expect(accessClaims.roles).toEqual(['ADMIN']);
  });

  it('refreshes session from a refresh token', async () => {
    vi.stubEnv('JWT_SECRET', 'a-secure-secret-key-with-more-than-thirty-two-chars');
    vi.stubEnv('JWT_ISSUER', 'dental-saas-tests');

    const pair = await issueTokenPair({
      userId: 'user-2',
      tenantId: 'tenant-2',
      sessionId: 'session-2',
      roles: ['ADMIN'],
      permissions: ['users:manage'],
    });

    const refreshed = await refreshSession(pair.refreshToken);
    expect(refreshed.accessToken).toBeTypeOf('string');
    expect(refreshed.refreshToken).toBeTypeOf('string');

    const refreshedClaims = verifyAccessToken(refreshed.accessToken);
    expect(refreshedClaims.userId).toBe('user-2');
    expect(refreshedClaims.tenantId).toBe('tenant-2');
    expect(refreshedClaims.sessionId).toBe('session-2');
  });

  it('rejects refresh token when token type is not refresh', async () => {
    vi.stubEnv('JWT_SECRET', 'a-secure-secret-key-with-more-than-thirty-two-chars');
    vi.stubEnv('JWT_ISSUER', 'dental-saas-tests');

    const pair = await issueTokenPair({
      userId: 'user-3',
      tenantId: 'tenant-3',
      sessionId: 'session-3',
      roles: ['ADMIN'],
      permissions: ['users:manage'],
    });

    await expect(refreshSession(pair.accessToken)).rejects.toThrow('Invalid refresh token type.');
  });

  it('rejects invalid access token', () => {
    vi.stubEnv('JWT_SECRET', 'a-secure-secret-key-with-more-than-thirty-two-chars');
    vi.stubEnv('JWT_ISSUER', 'dental-saas-tests');

    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });
});
