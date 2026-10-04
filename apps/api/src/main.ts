import './platform/env.js';
import { start } from './start.js';

try {
  await start();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Failed to start';
  console.error(message);
  process.exit(1);
}
