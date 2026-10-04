import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

/**
 * Loads `.env` from the working directory, then from the repository root.
 * Values already in the environment win, and the first file wins over the second.
 */
const repoRootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));

config({ path: ['.env', repoRootEnv], quiet: true });
