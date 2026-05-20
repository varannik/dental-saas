export { buildClinicalServiceServer } from './app.js';

import { pathToFileURL } from 'node:url';

import { buildClinicalServiceServer } from './app.js';

export interface ClinicalServiceConfig {
  host: string;
  port: number;
}

export function getDefaultClinicalServiceConfig(): ClinicalServiceConfig {
  return {
    host: process.env.CLINICAL_HOST ?? '0.0.0.0',
    port: Number(process.env.CLINICAL_PORT ?? 4003),
  };
}

async function start(): Promise<void> {
  const app = buildClinicalServiceServer();
  const config = getDefaultClinicalServiceConfig();
  await app.listen({ host: config.host, port: config.port });
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectRun) {
  start().catch((error: unknown) => {
    console.error('Failed to start clinical service.', error);
    process.exit(1);
  });
}
