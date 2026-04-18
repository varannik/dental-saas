import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import { getEnv } from './env.js';
import * as schema from './schema/index.js';

export type DatabaseSchema = typeof schema;
export type DatabaseClient = NodePgDatabase<DatabaseSchema>;

export interface DatabaseConnectionOptions {
  connectionString?: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  queryTimeoutMs?: number;
  allowExitOnIdle?: boolean;
  keepAlive?: boolean;
  keepAliveInitialDelayMs?: number;
  applicationName?: string;
  ssl?: PoolConfig['ssl'] | 'require' | 'disable';
}

let pool: Pool | null = null;
let db: DatabaseClient | null = null;
let closePromise: Promise<void> | null = null;
let shutdownHandlersRegistered = false;

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveSslOption(option: DatabaseConnectionOptions['ssl']): PoolConfig['ssl'] | undefined {
  if (option === 'disable') return false;
  if (option === 'require') {
    return {
      rejectUnauthorized: toBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, true),
    };
  }

  if (option !== undefined) return option;

  const sslMode = process.env.PGSSLMODE?.trim().toLowerCase();
  if (sslMode) {
    if (['disable', 'allow', 'prefer'].includes(sslMode)) return false;
    if (['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
      return {
        rejectUnauthorized: sslMode !== 'require',
      };
    }
  }

  return undefined;
}

function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return;

  const closeSafely = () => {
    void closeDatabase().catch((error) => {
      console.error('[database] failed to close postgres pool during shutdown', error);
    });
  };

  process.once('SIGINT', closeSafely);
  process.once('SIGTERM', closeSafely);
  process.once('beforeExit', closeSafely);

  shutdownHandlersRegistered = true;
}

export function createDatabasePool(options: DatabaseConnectionOptions = {}): Pool {
  if (pool) return pool;

  const env = getEnv();
  const nodeEnv = env.NODE_ENV;
  const maxConnectionsDefault = nodeEnv === 'test' ? 5 : 20;
  const idleTimeoutDefault = nodeEnv === 'test' ? 5_000 : 30_000;
  const queryTimeoutDefault = nodeEnv === 'test' ? 15_000 : 30_000;
  const statementTimeoutDefault = nodeEnv === 'test' ? 15_000 : 30_000;

  pool = new Pool({
    connectionString: options.connectionString ?? env.DATABASE_URL,
    max: options.maxConnections ?? toPositiveInt(process.env.DB_POOL_MAX, maxConnectionsDefault),
    idleTimeoutMillis:
      options.idleTimeoutMs ??
      toPositiveInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, idleTimeoutDefault),
    connectionTimeoutMillis:
      options.connectionTimeoutMs ??
      toPositiveInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS, 10_000),
    statement_timeout:
      options.statementTimeoutMs ??
      toPositiveInt(process.env.DB_POOL_STATEMENT_TIMEOUT_MS, statementTimeoutDefault),
    query_timeout:
      options.queryTimeoutMs ??
      toPositiveInt(process.env.DB_POOL_QUERY_TIMEOUT_MS, queryTimeoutDefault),
    keepAlive: options.keepAlive ?? toBoolean(process.env.DB_POOL_KEEP_ALIVE, true),
    keepAliveInitialDelayMillis:
      options.keepAliveInitialDelayMs ??
      toPositiveInt(process.env.DB_POOL_KEEP_ALIVE_INITIAL_DELAY_MS, 10_000),
    allowExitOnIdle:
      options.allowExitOnIdle ??
      toBoolean(process.env.DB_POOL_ALLOW_EXIT_ON_IDLE, nodeEnv === 'test'),
    application_name: options.applicationName ?? process.env.DB_APPLICATION_NAME ?? 'dental-saas',
    ssl: resolveSslOption(options.ssl),
  });

  pool.on('error', (error) => {
    console.error('[database] unexpected postgres pool error', error);
  });

  registerShutdownHandlers();

  return pool;
}

export function createDatabaseConnection(options: DatabaseConnectionOptions = {}): DatabaseClient {
  if (db) return db;
  db = drizzle(createDatabasePool(options), { schema });
  return db;
}

export function getDatabase(): DatabaseClient {
  return createDatabaseConnection();
}

export function getDatabasePool(): Pool {
  return createDatabasePool();
}

export function isDatabaseInitialized(): boolean {
  return pool !== null && db !== null;
}

export async function closeDatabase(): Promise<void> {
  if (!pool) {
    db = null;
    return;
  }

  if (closePromise) {
    await closePromise;
    return;
  }

  const poolToClose = pool;
  pool = null;
  db = null;

  closePromise = poolToClose
    .end()
    .catch((error) => {
      console.error('[database] failed to close postgres pool', error);
      throw error;
    })
    .finally(() => {
      closePromise = null;
    });

  await closePromise;
}
