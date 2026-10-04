import { uuidv7 } from '@dental/db';
import { withClinic, withTransaction, type Pool, type PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import { verifyPassword } from './passwords.js';
import {
  hashRefreshToken,
  newRefreshToken,
  type AccessClaims,
  type TokenService,
} from './tokens.js';

/**
 * Sign-in, refresh-token rotation and sign-out (F5).
 *
 * Refresh tokens rotate on every use. Each rotation records which token replaced which, so a
 * token presented a second time is reuse: the whole family is revoked, which signs out both
 * the legitimate client and whoever copied the token.
 */

export interface IdentityPolicy {
  /** Failed sign-ins before the account locks. */
  lockThreshold: number;
  /** First lock duration; it doubles with each further failure, up to a day. */
  lockBaseSeconds: number;
  refreshTtlDays: number;
}

export const DEFAULT_IDENTITY_POLICY: IdentityPolicy = {
  lockThreshold: 5,
  lockBaseSeconds: 60,
  refreshTtlDays: 7,
};

export interface Membership {
  clinicId: string;
  clinicName: string;
  role: string;
}

export interface SessionResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; email: string; locale: string };
  clinic: { id: string; name: string };
  role: string;
  permissions: string[];
  memberships: Membership[];
}

interface UserRow {
  id: string;
  email: string;
  status: string;
  locale: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  clinic_id: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by: string | null;
}

const invalidCredentials = () =>
  new HttpProblem(401, 'invalid_credentials', 'The email or password is incorrect.');

const sessionEnded = (title = 'The session has ended. Sign in again.') =>
  new HttpProblem(401, 'unauthenticated', title);

function accountLocked(until: Date) {
  const seconds = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  return new HttpProblem(
    423,
    'account_locked',
    'Too many failed sign-ins. Try again later.',
    { lockedUntil: until.toISOString() },
    { 'retry-after': String(seconds) }
  );
}

export class IdentityService {
  constructor(
    private readonly pool: Pool,
    private readonly tokens: TokenService,
    private readonly dummyHash: string,
    private readonly policy: IdentityPolicy = DEFAULT_IDENTITY_POLICY
  ) {}

  async login(input: {
    email: string;
    password: string;
    clinicId?: string;
    device?: string;
  }): Promise<SessionResult> {
    const { rows } = await this.pool.query<
      UserRow & {
        password_hash: string;
        locked_until: Date | null;
      }
    >('SELECT * FROM core.auth_find_user($1)', [input.email]);
    const user = rows[0];
    if (!user) {
      await verifyPassword(this.dummyHash, input.password);
      throw invalidCredentials();
    }
    if (user.locked_until && user.locked_until > new Date()) throw accountLocked(user.locked_until);

    if (!(await verifyPassword(user.password_hash, input.password))) {
      const lock = await this.pool.query<{ locked_until: Date | null }>(
        'SELECT core.auth_record_failure($1, $2, $3) AS locked_until',
        [user.id, this.policy.lockThreshold, this.policy.lockBaseSeconds]
      );
      const lockedUntil = lock.rows[0]?.locked_until;
      if (lockedUntil && lockedUntil > new Date()) throw accountLocked(lockedUntil);
      throw invalidCredentials();
    }
    // Checked after the password so a deactivated account looks like any wrong sign-in.
    if (user.status !== 'active') throw invalidCredentials();
    await this.pool.query('SELECT core.auth_record_success($1)', [user.id]);

    const memberships = await this.memberships(this.pool, user.id);
    const membership = chooseClinic(memberships, input.clinicId);
    return withTransaction(this.pool, (client) =>
      this.issue(client, user, membership, memberships, uuidv7(), input.device)
    );
  }

  async refresh(refreshToken: string, device?: string): Promise<SessionResult> {
    const outcome = await withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<SessionRow>(
        `SELECT id, user_id, family_id, clinic_id, expires_at, revoked_at, replaced_by
         FROM core.auth_sessions WHERE token_hash = $1 FOR UPDATE`,
        [hashRefreshToken(refreshToken)]
      );
      const session = rows[0];
      if (!session) return { error: sessionEnded() };

      if (session.revoked_at || session.replaced_by) {
        // Committed before the error is returned, so the revocation survives.
        await revokeFamily(client, session.family_id);
        return {
          error: new HttpProblem(
            401,
            'refresh_token_reused',
            'This sign-in was used elsewhere and has been ended. Sign in again.'
          ),
        };
      }
      if (session.expires_at <= new Date()) return { error: sessionEnded() };

      const user = (
        await client.query<UserRow>('SELECT * FROM core.auth_user($1)', [session.user_id])
      ).rows[0];
      const memberships = user ? await this.memberships(client, user.id) : [];
      const membership = memberships.find((entry) => entry.clinicId === session.clinic_id);
      if (!user || user.status !== 'active' || !membership) {
        await revokeFamily(client, session.family_id);
        return { error: sessionEnded('Access to this clinic has ended. Sign in again.') };
      }

      const result = await this.issue(
        client,
        user,
        membership,
        memberships,
        session.family_id,
        device
      );
      await client.query(
        `UPDATE core.auth_sessions SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
        [session.id, result.sessionRowId]
      );
      return { result };
    });
    if ('error' in outcome) throw outcome.error;
    return outcome.result;
  }

  /** Ends the whole refresh-token family. Unknown tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    await this.pool.query(
      `UPDATE core.auth_sessions SET revoked_at = now()
       WHERE family_id = (SELECT family_id FROM core.auth_sessions WHERE token_hash = $1)
         AND revoked_at IS NULL`,
      [hashRefreshToken(refreshToken)]
    );
  }

  /** The signed-in user and their clinic. The clinic is read under row-level security. */
  async me(claims: AccessClaims) {
    const user = (
      await this.pool.query<UserRow>('SELECT * FROM core.auth_user($1)', [claims.userId])
    ).rows[0];
    const clinic = await withClinic(this.pool, claims.clinicId, async (client) => {
      const { rows } = await client.query<{
        id: string;
        name: string;
        country: string;
        currency: string;
        timezone: string;
        tooth_notation: string;
        default_locale: string;
      }>(
        `SELECT id, name, country, currency, timezone, tooth_notation, default_locale
         FROM core.clinics`
      );
      return rows[0];
    });
    if (!user || user.status !== 'active' || !clinic) throw sessionEnded();
    return {
      user: { id: user.id, email: user.email, locale: user.locale },
      clinic: {
        id: clinic.id,
        name: clinic.name,
        country: clinic.country,
        currency: clinic.currency,
        timezone: clinic.timezone,
        toothNotation: clinic.tooth_notation,
        defaultLocale: clinic.default_locale,
      },
      role: claims.role,
      permissions: claims.permissions,
    };
  }

  private async memberships(client: Pool | PoolClient, userId: string): Promise<Membership[]> {
    const { rows } = await client.query<{
      clinic_id: string;
      clinic_name: string;
      role_key: string;
    }>('SELECT * FROM core.auth_memberships($1)', [userId]);
    return rows.map((row) => ({
      clinicId: row.clinic_id,
      clinicName: row.clinic_name,
      role: row.role_key,
    }));
  }

  private async issue(
    client: PoolClient,
    user: UserRow,
    membership: Membership,
    memberships: Membership[],
    familyId: string,
    device?: string
  ): Promise<SessionResult & { sessionRowId: string }> {
    const refreshToken = newRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.policy.refreshTtlDays * 86_400_000);
    const sessionRowId = uuidv7();
    await client.query(
      `INSERT INTO core.auth_sessions (id, user_id, family_id, token_hash, device, expires_at, clinic_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sessionRowId,
        user.id,
        familyId,
        hashRefreshToken(refreshToken),
        device?.slice(0, 200) ?? null,
        refreshExpiresAt,
        membership.clinicId,
      ]
    );
    const permissions = (
      await client.query<{ auth_permissions: string }>(
        'SELECT * FROM core.auth_permissions($1, $2)',
        [user.id, membership.clinicId]
      )
    ).rows.map((row) => row.auth_permissions);

    const accessToken = await this.tokens.signAccess({
      userId: user.id,
      clinicId: membership.clinicId,
      sessionId: familyId,
      role: membership.role,
      permissions,
    });
    return {
      sessionRowId,
      accessToken,
      expiresIn: this.tokens.accessTtlSeconds,
      refreshToken,
      refreshExpiresAt,
      user: { id: user.id, email: user.email, locale: user.locale },
      clinic: { id: membership.clinicId, name: membership.clinicName },
      role: membership.role,
      permissions,
      memberships,
    };
  }
}

function chooseClinic(memberships: Membership[], clinicId?: string): Membership {
  if (clinicId) {
    const chosen = memberships.find((membership) => membership.clinicId === clinicId);
    if (!chosen) throw new HttpProblem(403, 'forbidden', 'You are not a member of that clinic.');
    return chosen;
  }
  if (memberships.length === 0) {
    throw new HttpProblem(403, 'forbidden', 'Your account has no clinic membership.');
  }
  if (memberships.length > 1) {
    throw new HttpProblem(422, 'clinic_required', 'Choose a clinic to sign in to.', {
      clinics: memberships.map(({ clinicId: id, clinicName: name, role }) => ({ id, name, role })),
    });
  }
  return memberships[0]!;
}

async function revokeFamily(client: PoolClient, familyId: string) {
  await client.query(
    `UPDATE core.auth_sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId]
  );
}
