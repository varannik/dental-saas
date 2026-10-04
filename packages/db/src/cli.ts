import { migrate } from './migrate.js';

/**
 * Applies pending migrations. Migrations create roles and grants, so they run as the database
 * owner (DATABASE_MIGRATION_URL), never as the application role the API uses.
 */
const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error('Set DATABASE_MIGRATION_URL to the database owner connection.');
  process.exit(1);
}

try {
  await migrate(url);
  console.log('Migrations are up to date.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
