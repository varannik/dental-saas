import { DeepgramStt } from './modules/voice/adapters/deepgram.js';
import { interpretersFromConfig } from './modules/voice/interpreters.js';
import { buildServer } from './server.js';
import { loadConfig } from './platform/config.js';

export async function start(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const app = await buildServer({
    logger: { level: config.LOG_LEVEL },
    corsOrigin: config.CORS_ORIGIN,
    voiceSpike: config.VOICE_SPIKE_ENABLED
      ? {
          stt: new DeepgramStt({ apiKey: config.DEEPGRAM_API_KEY!, model: config.DEEPGRAM_MODEL }),
          interpreters: interpretersFromConfig(config),
        }
      : undefined,
  });
  await app.listen({ port: config.PORT, host: config.HOST });
  return app;
}
