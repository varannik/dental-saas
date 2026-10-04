import { ClaudeInterpreter } from './modules/voice/adapters/claude.js';
import { DeepgramStt } from './modules/voice/adapters/deepgram.js';
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
          interpreter: new ClaudeInterpreter({
            apiKey: config.ANTHROPIC_API_KEY!,
            model: config.VOICE_LLM_MODEL,
          }),
        }
      : undefined,
  });
  await app.listen({ port: config.PORT, host: config.HOST });
  return app;
}
