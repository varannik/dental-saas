import { timeStep, totpAt } from '../modules/identity/totp.js';

/**
 * Prints the current code for a TOTP secret, for local testing without an authenticator app:
 * pnpm --filter @dental/api auth:totp <secret>
 */
const secret = process.argv[2];
if (!secret) {
  console.error('Pass the secret from the enrolment response.');
  process.exit(1);
}
console.log(totpAt(secret, timeStep()));
