import { createHash, randomBytes } from 'node:crypto';
import { VOICE_TICKET_SECONDS } from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import { withClinic, type Pool } from '../../../platform/db.js';
import type { AccessClaims } from '../../identity/tokens.js';

/**
 * Single-use tickets for the voice WebSocket (spec section L). A ticket is the clinic id and
 * 32 random bytes; the clinic id lets the socket find it under row-level security, and only a
 * hash of the whole ticket is stored.
 */

export interface TicketHolder {
  clinicId: string;
  userId: string;
  role: string;
  /** When the access token that asked for the ticket expires. */
  accessExpiresAt: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = (ticket: string) => createHash('sha256').update(ticket).digest('hex');

export async function issueTicket(
  pool: Pool,
  claims: AccessClaims
): Promise<{ ticket: string; expiresAt: Date }> {
  const ticket = `${claims.clinicId}.${randomBytes(32).toString('base64url')}`;
  const accessExpiresAt = new Date((claims.expiresAt ?? Date.now() / 1000) * 1000);
  return withClinic(pool, claims.clinicId, async (client) => {
    const { rows } = await client.query<{ expires_at: Date }>(
      `INSERT INTO voice.stream_tickets
         (id, clinic_id, user_id, token_hash, role, access_expires_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))
       RETURNING expires_at`,
      [
        uuidv7(),
        claims.clinicId,
        claims.userId,
        hash(ticket),
        claims.role,
        accessExpiresAt,
        VOICE_TICKET_SECONDS,
      ]
    );
    return { ticket, expiresAt: rows[0]!.expires_at };
  });
}

/** Marks the ticket used and returns its holder; null when unknown, used or expired. */
export async function consumeTicket(pool: Pool, ticket: string): Promise<TicketHolder | null> {
  const clinicId = ticket.split('.', 1)[0] ?? '';
  if (!UUID.test(clinicId) || ticket.length > 200) return null;
  return withClinic(pool, clinicId, async (client) => {
    const { rows } = await client.query<{
      user_id: string;
      role: string;
      access_expires_at: Date;
    }>(
      `UPDATE voice.stream_tickets SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id, role, access_expires_at`,
      [hash(ticket)]
    );
    const row = rows[0];
    return row
      ? {
          clinicId,
          userId: row.user_id,
          role: row.role,
          accessExpiresAt: row.access_expires_at,
        }
      : null;
  });
}
