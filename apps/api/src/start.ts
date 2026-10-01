import { buildServer } from './server.js';
import { loadConfig } from './platform/config.js';

export async function start(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const app = await buildServer({
    logger: { level: config.LOG_LEVEL },
    corsOrigin: config.CORS_ORIGIN,
  });
  await app.listen({ port: config.PORT, host: config.HOST });
  return app;
}
