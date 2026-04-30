export { env, getEnv, loadEnv, resetEnvCache } from './env.js';
export type { Env } from './env.js';

export {
  closeDatabase,
  createDatabaseConnection,
  createDatabasePool,
  getDatabase,
  getDatabasePool,
  isDatabaseInitialized,
} from './database.js';
export type { DatabaseClient, DatabaseConnectionOptions, DatabaseSchema } from './database.js';

export * as schema from './schema/index.js';
export * from './schema/index.js';

export {
  ensureCdtReferenceForAllActiveTenants,
  ensureCdtReferenceForTenant,
} from './seed/cdt-reference.js';
export {
  CDT_PROCEDURE_SEED_ROWS,
  CDT_SEED_VERSION,
  CDT_SYSTEM_KEY,
} from './seed-data/cdt-procedures.js';
export type { CdtProcedureSeedRow } from './seed-data/cdt-procedures.js';
