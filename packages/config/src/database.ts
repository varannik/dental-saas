import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import { getEnv } from './env.js';

export type DatabaseClient = NodePgDatabase<Record<string, never>>;

export interface DatabaseConnectionOptions {
  connectionString?: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  ssl?: PoolConfig['ssl'];
}

let pool: Pool | null = null;
let db: DatabaseClient | null = null;

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createDatabasePool(options: DatabaseConnectionOptions = {}): Pool {
  if (pool) return pool;

  const env = getEnv();

  pool = new Pool({
    connectionString: options.connectionString ?? env.DATABASE_URL,
    max: options.maxConnections ?? toPositiveInt(process.env.DB_POOL_MAX, 20),
    idleTimeoutMillis:
      options.idleTimeoutMs ?? toPositiveInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis:
      options.connectionTimeoutMs ??
      toPositiveInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS, 10_000),
    ssl: options.ssl,
  });

  pool.on('error', (error) => {
    console.error('[database] unexpected postgres pool error', error);
  });

  return pool;
}

export function createDatabaseConnection(options: DatabaseConnectionOptions = {}): DatabaseClient {
  if (db) return db;
  db = drizzle(createDatabasePool(options));
  return db;
}

export function getDatabase(): DatabaseClient {
  return createDatabaseConnection();
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
  }
  pool = null;
  db = null;
}
