import jwt from 'jsonwebtoken';

export interface AccessTokenClaims {
  userId: string;
  tenantId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me-immediately';
}

function getJwtIssuer(): string {
  return process.env.JWT_ISSUER ?? 'dental-saas';
}

/** Validates gateway-forwarded Bearer access token; returns claims or null. */
export function verifyAccessTokenFromAuthorizationHeader(
  authorization: string | undefined
): AccessTokenClaims | null {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return null;
  }
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret(), {
      issuer: getJwtIssuer(),
    }) as AccessTokenClaims;
  } catch {
    return null;
  }
}
