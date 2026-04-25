import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

export interface TokenClaims {
  userId: string;
  tenantId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me-immediately';
}

function getJwtIssuer(): string {
  return process.env.JWT_ISSUER ?? 'dental-saas';
}

export async function issueTokenPair(claims: TokenClaims): Promise<TokenPair> {
  const accessTokenExpiry = (process.env.JWT_ACCESS_TOKEN_EXPIRY ??
    '15m') as SignOptions['expiresIn'];
  const refreshTokenExpiry = (process.env.JWT_REFRESH_TOKEN_EXPIRY ??
    '7d') as SignOptions['expiresIn'];

  const accessToken = jwt.sign(claims, getJwtSecret(), {
    expiresIn: accessTokenExpiry,
    issuer: getJwtIssuer(),
    subject: claims.userId,
  });

  const refreshToken = jwt.sign(
    {
      userId: claims.userId,
      tenantId: claims.tenantId,
      sessionId: claims.sessionId,
      type: 'refresh',
    },
    getJwtSecret(),
    {
      expiresIn: refreshTokenExpiry,
      issuer: getJwtIssuer(),
      subject: claims.userId,
    }
  );

  return { accessToken, refreshToken };
}

export async function refreshSession(refreshToken: string): Promise<TokenPair> {
  const decoded = jwt.verify(refreshToken, getJwtSecret(), {
    issuer: getJwtIssuer(),
  }) as { userId: string; tenantId: string; sessionId: string; type?: string };

  if (decoded.type !== 'refresh') {
    throw new Error('Invalid refresh token type.');
  }

  return issueTokenPair({
    userId: decoded.userId,
    tenantId: decoded.tenantId,
    sessionId: decoded.sessionId,
    roles: ['ADMIN'],
    permissions: ['users:manage'],
  });
}

export function verifyAccessToken(token: string): TokenClaims {
  return jwt.verify(token, getJwtSecret(), {
    issuer: getJwtIssuer(),
  }) as TokenClaims;
}
