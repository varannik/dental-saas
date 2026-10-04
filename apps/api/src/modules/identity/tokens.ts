import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

/**
 * Short-lived access tokens signed with Ed25519 (EdDSA), and opaque refresh tokens that are
 * stored only as hashes. Asymmetric keys replace the old repository's shared secret.
 */

const ISSUER = 'dental-api';
const AUDIENCE = 'dental-app';
/** Challenge tokens carry their own audience, so they are never accepted as access tokens. */
const CHALLENGE_AUDIENCE = 'dental-mfa';
const CHALLENGE_TTL_SECONDS = 300;
const ALGORITHM = 'EdDSA';

export interface AccessClaims {
  userId: string;
  clinicId: string;
  /** Refresh-token family; logout revokes it. */
  sessionId: string;
  role: string;
  permissions: string[];
}

const claimsSchema = z.object({
  sub: z.string().uuid(),
  cid: z.string().uuid(),
  sid: z.string().uuid(),
  role: z.string(),
  perms: z.array(z.string()),
});

/** Proof that the password step passed; exchanged with a TOTP code for a session. */
export interface ChallengeClaims {
  userId: string;
  clinicId: string;
}

const challengeSchema = z.object({ sub: z.string().uuid(), cid: z.string().uuid() });

export interface SigningKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** True when no key was configured and one was generated for this process. */
  ephemeral: boolean;
}

/** Loads the Ed25519 private key (PKCS#8 PEM), or generates one when none is configured. */
export function loadSigningKeys(privateKeyPem?: string): SigningKeys {
  if (privateKeyPem) {
    // Environment files often hold the PEM on one line with literal "\n".
    const privateKey = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'));
    if (privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('AUTH_PRIVATE_KEY must be an Ed25519 private key.');
    }
    return { privateKey, publicKey: createPublicKey(privateKey), ephemeral: false };
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKey, ephemeral: true };
}

export class TokenService {
  constructor(
    private readonly keys: SigningKeys,
    readonly accessTtlSeconds: number
  ) {}

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({
      cid: claims.clinicId,
      sid: claims.sessionId,
      role: claims.role,
      perms: claims.permissions,
    })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.keys.privateKey);
  }

  /** Returns the claims of a valid token, or null for any invalid, expired or foreign token. */
  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys.publicKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALGORITHM],
      });
      const claims = claimsSchema.parse(payload);
      return {
        userId: claims.sub,
        clinicId: claims.cid,
        sessionId: claims.sid,
        role: claims.role,
        permissions: claims.perms,
      };
    } catch {
      return null;
    }
  }
}

export class ChallengeTokens {
  readonly ttlSeconds = CHALLENGE_TTL_SECONDS;

  constructor(private readonly keys: SigningKeys) {}

  async sign(claims: ChallengeClaims): Promise<string> {
    return new SignJWT({ cid: claims.clinicId })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(CHALLENGE_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${CHALLENGE_TTL_SECONDS}s`)
      .sign(this.keys.privateKey);
  }

  async verify(token: string): Promise<ChallengeClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys.publicKey, {
        issuer: ISSUER,
        audience: CHALLENGE_AUDIENCE,
        algorithms: [ALGORITHM],
      });
      const claims = challengeSchema.parse(payload);
      return { userId: claims.sub, clinicId: claims.cid };
    } catch {
      return null;
    }
  }
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
