import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../utils/logger';

// Create a connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'dental_auth',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection to become available
});

// Log connection events
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Non-retryable error codes
const NON_RETRYABLE_ERRORS = [
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '42P01', // undefined_table
  '42703', // undefined_column
  '42P07', // duplicate_table
  '42701', // duplicate_column
  '22P02', // invalid_text_representation
];

/**
 * Execute a query with retry logic for transient errors
 */
const query = async <T = any>(
  text: string, 
  params: any[] = [], 
  retries = 3, 
  delay = 1000
): Promise<QueryResult<T>> => {
  try {
    return await pool.query<T>(text, params);
  } catch (err: any) {
    // Don't retry if it's a non-retryable error
    if (err.code && NON_RETRYABLE_ERRORS.includes(err.code)) {
      throw err;
    }

    // Don't retry if we've exhausted retries
    if (retries <= 0) {
      throw err;
    }

    // Log the error and retry
    logger.warn(`Database query error, retrying (${retries} attempts left): ${err.message}`);
    
    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry with exponential backoff
    return query(text, params, retries - 1, delay * 2);
  }
};

/**
 * Execute a transaction with automatic rollback on error
 */
const transaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default {
  pool,
  query,
  transaction
}; 