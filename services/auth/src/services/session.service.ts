import { randomUUID, createHash } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { Redis } from 'ioredis';

import { createDatabaseConnection } from '../../../../packages/config/src/database.js';
import { sessions } from '../../../../packages/config/src/schema/tenancy.js';
import { parseBearerToken } from '../middleware/authenticate.js';
import { verifyAccessToken } from './token.service.js';

export interface SessionUser {
  userId: string;
  tenantId: string;
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  lastActivityAt: string;
}

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  return redisClient;
}

function getSessionTtlSeconds(): number {
  const raw = process.env.SESSION_TTL_SECONDS;
  if (!raw) return 86_400;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 86_400;
}

function getSessionKey(tenantId: string, sessionId: string): string {
  return `dental:session:${tenantId}:${sessionId}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(params: {
  sessionId?: string;
  userId: string;
  tenantId: string;
  accessToken: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{ sessionId: string }> {
  const db = createDatabaseConnection();
  const redis = getRedisClient();
  const sessionId = params.sessionId ?? randomUUID();
  const ttl = getSessionTtlSeconds();
  const expiresAt = new Date(Date.now() + ttl * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: params.userId,
    tenantId: params.tenantId,
    tokenHash: hashToken(params.accessToken),
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
    expiresAt,
    deviceInfo: null,
  });

  await redis.set(
    getSessionKey(params.tenantId, sessionId),
    JSON.stringify({
      userId: params.userId,
      tenantId: params.tenantId,
      sessionId,
      lastActivityAt: new Date().toISOString(),
    }),
    'EX',
    ttl
  );

  return { sessionId };
}

export async function revokeSession(authorizationHeader: string | undefined): Promise<void> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) return;

  const claims = verifyAccessToken(token);
  const db = createDatabaseConnection();
  const redis = getRedisClient();

  await db
    .update(sessions)
    .set({
      revokedAt: new Date(),
      revokeReason: 'USER_LOGOUT',
    })
    .where(and(eq(sessions.id, claims.sessionId), isNull(sessions.revokedAt)));

  await redis.del(getSessionKey(claims.tenantId, claims.sessionId));
}

export async function getCurrentSessionUser(
  authorizationHeader: string | undefined
): Promise<SessionUser | null> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) return null;

  const claims = verifyAccessToken(token);
  const redis = getRedisClient();
  const cache = await redis.get(getSessionKey(claims.tenantId, claims.sessionId));
  if (!cache) return null;

  return {
    userId: claims.userId,
    tenantId: claims.tenantId,
  };
}

export async function listActiveSessions(
  authorizationHeader: string | undefined
): Promise<ActiveSession[]> {
  const user = await getCurrentSessionUser(authorizationHeader);
  if (!user) return [];

  const db = createDatabaseConnection();
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      tenantId: sessions.tenantId,
      lastActivityAt: sessions.lastActivityAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, user.userId),
        eq(sessions.tenantId, user.tenantId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date())
      )
    );

  return rows.map((row) => ({
    sessionId: row.sessionId,
    userId: row.userId,
    tenantId: row.tenantId,
    lastActivityAt: row.lastActivityAt.toISOString(),
  }));
}
