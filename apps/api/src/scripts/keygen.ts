import { generateKeyPairSync, randomBytes } from 'node:crypto';

/**
 * Prints new keys as .env lines: pnpm --filter @dental/api auth:keygen
 * AUTH_PRIVATE_KEY signs access tokens (Ed25519); changing it ends every session.
 * MFA_ENCRYPTION_KEY encrypts TOTP secrets, DATA_ENCRYPTION_KEY patient identifiers; changing
 * either makes the values encrypted with it unreadable.
 */
const pem = generateKeyPairSync('ed25519')
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString()
  .trim();
console.log(`AUTH_PRIVATE_KEY="${pem.replace(/\n/g, '\\n')}"`);
console.log(`MFA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
console.log(`DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
