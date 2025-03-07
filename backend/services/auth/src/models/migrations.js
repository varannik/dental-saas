/**
 * Database migrations
 */
require('dotenv').config();
const { pool } = require('./db');
const logger = require('../utils/logger');

// Migrations array - add new migrations at the end
const migrations = [
  {
    name: '001_initial_schema',
    up: `
      -- Create tenants table
      CREATE TABLE IF NOT EXISTS public.tenants (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(255) UNIQUE NOT NULL,
        subscription_plan VARCHAR(50) NOT NULL,
        subscription_status VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create users table
      CREATE TABLE IF NOT EXISTS public.users (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id),
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(tenant_id, email)
      );

      -- Create refresh tokens table
      CREATE TABLE IF NOT EXISTS public.refresh_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES public.users(id),
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        revoked BOOLEAN DEFAULT false,
        revoked_at TIMESTAMP WITH TIME ZONE
      );

      -- Create password reset tokens table
      CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES public.users(id),
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        used BOOLEAN DEFAULT false
      );

      -- Create email verification tokens table
      CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES public.users(id),
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        used BOOLEAN DEFAULT false
      );

      -- Create migrations table to track applied migrations
      CREATE TABLE IF NOT EXISTS public.migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },
  {
    name: '002_add_indexes',
    up: `
      -- Add indexes for performance
      CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON public.password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON public.email_verification_tokens(user_id);
    `
  }
  // Add more migrations here as needed
];

// Function to run migrations
const runMigrations = async () => {
  const client = await pool.connect();
  
  try {
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // Get applied migrations
    const { rows: appliedMigrations } = await client.query(
      'SELECT name FROM public.migrations'
    );
    const appliedMigrationNames = appliedMigrations.map(m => m.name);
    
    // Run pending migrations
    for (const migration of migrations) {
      if (!appliedMigrationNames.includes(migration.name)) {
        logger.info(`Applying migration: ${migration.name}`);
        
        await client.query('BEGIN');
        
        try {
          // Run the migration
          await client.query(migration.up);
          
          // Record the migration
          await client.query(
            'INSERT INTO public.migrations (name) VALUES ($1)',
            [migration.name]
          );
          
          await client.query('COMMIT');
          logger.info(`Migration applied: ${migration.name}`);
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error(`Migration failed: ${migration.name}`, err);
          throw err;
        }
      }
    }
    
    logger.info('All migrations applied successfully');
  } finally {
    client.release();
  }
};

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migration process completed');
      process.exit(0);
    })
    .catch(err => {
      logger.error('Migration process failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations }; 