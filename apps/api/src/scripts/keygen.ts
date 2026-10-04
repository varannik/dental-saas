import { generateKeyPairSync } from 'node:crypto';

/** Prints a new Ed25519 signing key as one .env line: pnpm --filter @dental/api auth:keygen */
const pem = generateKeyPairSync('ed25519')
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString()
  .trim();
console.log(`AUTH_PRIVATE_KEY="${pem.replace(/\n/g, '\\n')}"`);
