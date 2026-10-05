import '../platform/env.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { clinicOnboard } from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import { CommandBus } from '../modules/commands/bus.js';
import { registerOnboarding, type OnboardResult } from '../modules/clinic/onboard.js';
import { hashPassword } from '../modules/identity/passwords.js';
import { createPool } from '../platform/db.js';
import { HttpProblem } from '../platform/http-problem.js';

/**
 * Operator CLI: onboards a clinic and its first administrator.
 *
 *   pnpm --filter @dental/api clinic:onboard --name "Tehran Smile" --country IR \
 *     --currency IRR --timezone Asia/Tehran --locale fa-IR --admin owner@example.com
 *
 * Options: --profile (default standard), --notation (default FDI).
 * Runs as the database owner (DATABASE_MIGRATION_URL), through the command bus, so the
 * onboarding is a recorded command and the first entries of the clinic's audit chain.
 */

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      country: { type: 'string' },
      currency: { type: 'string' },
      timezone: { type: 'string' },
      locale: { type: 'string', default: 'en' },
      notation: { type: 'string', default: 'FDI' },
      profile: { type: 'string', default: 'standard' },
      admin: { type: 'string' },
    },
  });
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('Set DATABASE_MIGRATION_URL to the database owner connection.');

  // A one-time password, shown once below. The user replaces it after signing in.
  const temporaryPassword = randomBytes(12).toString('base64url');
  const payload = {
    name: values.name,
    country: values.country?.toUpperCase(),
    currency: values.currency?.toUpperCase(),
    timezone: values.timezone,
    defaultLocale: values.locale,
    toothNotation: values.notation,
    regulatoryProfile: values.profile,
    admin: { email: values.admin, passwordHash: await hashPassword(temporaryPassword) },
  };

  const pool = createPool(url);
  const bus = new CommandBus(pool);
  registerOnboarding(bus);
  try {
    const outcome = await bus.execute(
      { type: clinicOnboard.type, payload, idempotencyKey: randomUUID(), source: 'system' },
      { userId: null, clinicId: uuidv7(), permissions: ['platform.manage'] }
    );
    const result = outcome.result as OnboardResult;
    console.log(`Onboarded "${values.name}" (${result.clinicId}).`);
    console.log(`Administrator: ${values.admin}`);
    if (result.adminCreated) {
      console.log(`One-time password: ${temporaryPassword}`);
      console.log('Share it securely. The first sign-in also sets up the authenticator app.');
    } else {
      console.log('The account already existed and keeps its password.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof HttpProblem) {
    console.error(error.title);
    for (const issue of (error.extra.issues as { path: string; message: string }[]) ?? []) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
