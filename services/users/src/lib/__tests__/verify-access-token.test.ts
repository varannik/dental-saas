import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { verifyAccessTokenFromAuthorizationHeader } from '../verify-access-token.js';

describe('verifyAccessTokenFromAuthorizationHeader', () => {
  it('returns null for missing or non-bearer header', () => {
    expect(verifyAccessTokenFromAuthorizationHeader(undefined)).toBeNull();
    expect(verifyAccessTokenFromAuthorizationHeader('Basic x')).toBeNull();
  });

  it('returns claims for a valid HS256 access token', () => {
    const token = jwt.sign(
      {
        userId: 'user-1',
        tenantId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'sess-1',
        roles: ['ADMIN'],
        permissions: ['users:manage'],
      },
      'test-secret-32-characters-minimum',
      { issuer: 'dental-saas', subject: 'user-1' }
    );

    process.env.JWT_SECRET = 'test-secret-32-characters-minimum';
    process.env.JWT_ISSUER = 'dental-saas';

    const claims = verifyAccessTokenFromAuthorizationHeader(`Bearer ${token}`);
    expect(claims).toMatchObject({
      userId: 'user-1',
      tenantId: '11111111-1111-4111-8111-111111111111',
      sessionId: 'sess-1',
    });
  });

  it('returns null for invalid token', () => {
    process.env.JWT_SECRET = 'test-secret-32-characters-minimum';
    process.env.JWT_ISSUER = 'dental-saas';
    expect(verifyAccessTokenFromAuthorizationHeader('Bearer not-a-jwt')).toBeNull();
  });
});
