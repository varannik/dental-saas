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

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
}

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(getRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
    });
  }

  return redisClient;
}

async function ensureRedisReady(): Promise<Redis> {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    return redis;
  }

  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    await redis.ping();
    return redis;
  } catch (cause) {
    const err = new Error(
      `Redis is not reachable at ${getRedisUrl()}. For Docker Compose use REDIS_URL=redis://redis:6379 and recreate the auth container.`
    ) as Error & { statusCode: number };
    err.statusCode = 503;
    err.cause = cause;
    throw err;
  }
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
  const sessionId = params.sessionId ?? randomUUID();
  const ttl = getSessionTtlSeconds();
  const expiresAt = new Date(Date.now() + ttl * 1000);

  try {
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
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const err = new Error(message) as Error & { statusCode: number };
    err.statusCode = 500;
    err.cause = cause;
    if (/relation ["']?sessions["']? does not exist/i.test(message)) {
      err.message =
        'Database is missing the sessions table. Run: make db-migrate (with Docker Postgres on :5433).';
    }
    throw err;
  }

  const redis = await ensureRedisReady();
  try {
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
  } catch (cause) {
    await db
      .delete(sessions)
      .where(eq(sessions.id, sessionId))
      .catch(() => undefined);
    throw cause;
  }

  return { sessionId };
}

export async function revokeSession(authorizationHeader: string | undefined): Promise<void> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) return;

  const claims = verifyAccessToken(token);
  const db = createDatabaseConnection();
  const redis = await ensureRedisReady();

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
  const redis = await ensureRedisReady();
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
