import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

// Create database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'dental_auth',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Create migrations table if it doesn't exist
const initMigrationsTable = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
};

// Get all migration files
const getMigrationFiles = (): string[] => {
  const migrationsDir = path.join(__dirname);
  return fs
    .readdirSync(migrationsDir)
    .filter(file => file.match(/^\d+_.+\.ts$/) && file !== 'runner.ts')
    .sort();
};

// Get applied migrations from database
const getAppliedMigrations = async (): Promise<string[]> => {
  const result = await pool.query('SELECT name FROM migrations ORDER BY id');
  return result.rows.map(row => row.name);
};

// Run migrations
const runMigrations = async (direction: 'up' | 'down'): Promise<void> => {
  await initMigrationsTable();
  
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();
  
  if (direction === 'up') {
    // Run pending migrations
    for (const file of migrationFiles) {
      const migrationName = file.replace('.ts', '');
      
      if (!appliedMigrations.includes(migrationName)) {
        logger.info(`Applying migration: ${migrationName}`);
        
        const migration = require(path.join(__dirname, file));
        await migration.up(pool);
        
        await pool.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migrationName]
        );
        
        logger.info(`Migration ${migrationName} applied successfully`);
      }
    }
  } else if (direction === 'down') {
    // Rollback last migration
    if (appliedMigrations.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }
    
    const lastMigration = appliedMigrations[appliedMigrations.length - 1];
    const lastMigrationFile = migrationFiles.find(file => file.replace('.ts', '') === lastMigration);
    
    if (lastMigrationFile) {
      logger.info(`Rolling back migration: ${lastMigration}`);
      
      const migration = require(path.join(__dirname, lastMigrationFile));
      await migration.down(pool);
      
      await pool.query(
        'DELETE FROM migrations WHERE name = $1',
        [lastMigration]
      );
      
      logger.info(`Migration ${lastMigration} rolled back successfully`);
    }
  }
};

// Main function
const main = async (): Promise<void> => {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  
  try {
    await runMigrations(direction);
    logger.info(`Migrations ${direction} completed successfully`);
  } catch (err) {
    logger.error(`Error running migrations: ${err}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { runMigrations }; 