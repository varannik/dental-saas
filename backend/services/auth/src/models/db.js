/**
 * Database connection module
 */
const { Pool } = require('pg');
const logger = require('../utils/logger');

// Create a connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dental_auth',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Add event listeners for connection issues
pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

// Retry logic for database queries
const query = async (text, params, retries = 3, delay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      lastError = err;
      
      // Don't retry if the error is something that won't be fixed by retrying
      if (err.code === '42P01') { // Undefined table
        throw err;
      }
      
      if (err.code === '42703') { // Undefined column
        throw err;
      }
      
      if (err.code === '23505') { // Unique violation
        throw err;
      }
      
      logger.warn(`Database query attempt ${attempt} failed: ${err.message}`);
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        // Exponential backoff
        delay *= 2;
      }
    }
  }
  
  throw lastError;
};

// Transaction with retry logic
const transaction = async (callback) => {
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

module.exports = {
  query,
  transaction,
  pool
}; 