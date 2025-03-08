import { Pool, QueryResult } from 'pg';

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  revoked: boolean;
  revokedAt?: Date;
  createdAt?: Date;
}

export interface EmailVerificationToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt?: Date;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt?: Date;
}

export interface TokenRepositoryInterface {
  saveRefreshToken(token: RefreshToken): Promise<void>;
  getRefreshToken(tokenId: string, userId: string): Promise<RefreshToken | null>;
  revokeRefreshToken(tokenId: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;
  saveEmailVerificationToken(token: EmailVerificationToken): Promise<void>;
  getEmailVerificationToken(token: string): Promise<EmailVerificationToken | null>;
  useEmailVerificationToken(tokenId: string): Promise<void>;
  savePasswordResetToken(token: PasswordResetToken): Promise<void>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | null>;
  usePasswordResetToken(tokenId: string): Promise<void>;
}

export class TokenRepository implements TokenRepositoryInterface {
  constructor(private db: Pool) {}

  async saveRefreshToken(token: RefreshToken): Promise<void> {
    await this.db.query(
      `INSERT INTO refresh_tokens 
      (id, user_id, token, expires_at, revoked) 
      VALUES ($1, $2, $3, $4, $5)`,
      [token.id, token.userId, token.token, token.expiresAt, token.revoked]
    );
  }

  async getRefreshToken(tokenId: string, userId: string): Promise<RefreshToken | null> {
    const result: QueryResult<any> = await this.db.query(
      `SELECT id, user_id, token, expires_at, revoked, revoked_at, created_at 
      FROM refresh_tokens 
      WHERE id = $1 AND user_id = $2`,
      [tokenId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
      revoked: row.revoked,
      revokedAt: row.revoked_at,
      createdAt: row.created_at
    };
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens 
      SET revoked = true, revoked_at = NOW() 
      WHERE id = $1`,
      [tokenId]
    );
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens 
      SET revoked = true, revoked_at = NOW() 
      WHERE user_id = $1 AND revoked = false`,
      [userId]
    );
  }

  // Implementation for email verification tokens
  async saveEmailVerificationToken(token: EmailVerificationToken): Promise<void> {
    await this.db.query(
      `INSERT INTO email_verification_tokens 
      (id, user_id, token, expires_at, used) 
      VALUES ($1, $2, $3, $4, $5)`,
      [token.id, token.userId, token.token, token.expiresAt, token.used]
    );
  }

  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | null> {
    const result: QueryResult<any> = await this.db.query(
      `SELECT id, user_id, token, expires_at, used, created_at 
      FROM email_verification_tokens 
      WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
      used: row.used,
      createdAt: row.created_at
    };
  }

  async useEmailVerificationToken(tokenId: string): Promise<void> {
    await this.db.query(
      `UPDATE email_verification_tokens 
      SET used = true 
      WHERE id = $1`,
      [tokenId]
    );
  }

  // Implementation for password reset tokens
  async savePasswordResetToken(token: PasswordResetToken): Promise<void> {
    await this.db.query(
      `INSERT INTO password_reset_tokens 
      (id, user_id, token, expires_at, used) 
      VALUES ($1, $2, $3, $4, $5)`,
      [token.id, token.userId, token.token, token.expiresAt, token.used]
    );
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | null> {
    const result: QueryResult<any> = await this.db.query(
      `SELECT id, user_id, token, expires_at, used, created_at 
      FROM password_reset_tokens 
      WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
      used: row.used,
      createdAt: row.created_at
    };
  }

  async usePasswordResetToken(tokenId: string): Promise<void> {
    await this.db.query(
      `UPDATE password_reset_tokens 
      SET used = true 
      WHERE id = $1`,
      [tokenId]
    );
  }
} 