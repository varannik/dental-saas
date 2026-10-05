import '../platform/env.js';
import { createPool } from '../platform/db.js';
import { verifyChain } from '../modules/audit/chain.js';

/**
 * Recomputes every clinic's audit chain: pnpm --filter @dental/api audit:verify
 * Runs as the database owner (DATABASE_MIGRATION_URL) to see every clinic. Exits non-zero
 * when any chain is broken, so a scheduled job can alert on it (spec section M).
 */
async function main() {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('Set DATABASE_MIGRATION_URL to the database owner connection.');
  const pool = createPool(url);
  const client = await pool.connect();
  let broken = 0;
  try {
    const clinics = await client.query<{ id: string; name: string }>(
      'SELECT id, name FROM core.clinics ORDER BY name'
    );
    for (const clinic of clinics.rows) {
      const report = await verifyChain(client, clinic.id);
      if (report.ok) {
        console.log(`ok      ${clinic.name}: ${report.checked} entries`);
      } else {
        broken += 1;
        console.log(`BROKEN  ${clinic.name}: entry ${report.brokenAt}, ${report.reason}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
  if (broken > 0) process.exit(2);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
