export interface AuthClaims {
  sub: string;
  tenantId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export function parseBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
