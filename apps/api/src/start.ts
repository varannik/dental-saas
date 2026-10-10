import type { FastifyBaseLogger } from 'fastify';
import { DeepgramStt } from './modules/voice/adapters/deepgram.js';
import { interpretersFromConfig } from './modules/voice/interpreters.js';
import { createSpeechSink } from './modules/voice/stream/speech-sink.js';
import { clinicKeyterms } from './modules/voice/vocabulary.js';
import { ValkeyContextStore } from './modules/voice/context/store.js';
import type { InterpretationService } from './modules/voice/interpreter/service.js';
import type { InterpreterRegistry } from './modules/voice/interpreters.js';
import { createDummyHash } from './modules/identity/passwords.js';
import { IdentityService } from './modules/identity/service.js';
import { ChallengeTokens, loadSigningKeys, TokenService } from './modules/identity/tokens.js';
import { SecretBox } from './platform/secret-box.js';
import { buildServer } from './server.js';
import { loadConfig } from './platform/config.js';
import { assertRowLevelSecurityEnforced, createPool } from './platform/db.js';

export async function start(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const pool = createPool(config.DATABASE_URL);
  try {
    await assertRowLevelSecurityEnforced(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }

  const keys = loadSigningKeys(config.AUTH_PRIVATE_KEY);
  const tokens = new TokenService(keys, config.AUTH_ACCESS_TTL_SECONDS);
  const production = config.NODE_ENV === 'production';
  const secrets = config.MFA_ENCRYPTION_KEY
    ? SecretBox.fromBase64(config.MFA_ENCRYPTION_KEY)
    : SecretBox.development();
  const service = new IdentityService({
    pool,
    tokens,
    challenges: new ChallengeTokens(keys),
    secrets,
    dummyHash: await createDummyHash(),
    policy: { lockThreshold: 5, lockBaseSeconds: 60, refreshTtlDays: config.AUTH_REFRESH_TTL_DAYS },
  });

  // Speech recognition for the voice stream when a provider is configured (V2, ADR 0005).
  const stt = config.DEEPGRAM_API_KEY
    ? new DeepgramStt({ apiKey: config.DEEPGRAM_API_KEY, model: config.DEEPGRAM_MODEL })
    : null;
  let log: FastifyBaseLogger | undefined;
  let interpretation: InterpretationService | null | undefined;
  // Interpretation of voice commands (V4) when the default interpreter has a key.
  let interpreters: InterpreterRegistry | undefined;
  try {
    interpreters = interpretersFromConfig(config);
  } catch {
    interpreters = undefined;
  }

  const app = await buildServer({
    logger: { level: config.LOG_LEVEL },
    corsOrigin: config.CORS_ORIGIN,
    contextStore: new ValkeyContextStore(config.VALKEY_URL),
    interpreters,
    identity: {
      pool,
      service,
      tokens,
      // Production serves the web app from another site, so the cookie must be SameSite=None
      // and therefore Secure. Locally both apps are on localhost, the same site, over HTTP.
      cookie: production ? { secure: true, sameSite: 'none' } : { secure: false, sameSite: 'lax' },
      dataBox: config.DATA_ENCRYPTION_KEY
        ? SecretBox.fromBase64(config.DATA_ENCRYPTION_KEY)
        : SecretBox.development(),
    },
    voiceStream: stt
      ? {
          createSink: (owner, emit) =>
            createSpeechSink(
              {
                stt,
                keyterms: clinicKeyterms(pool, owner.clinicId),
                log: log!,
                onStart: () => interpretation?.warm(),
                onFinal: (utteranceId, text, confidence) => {
                  void interpretation
                    ?.interpret(
                      {
                        clinicId: owner.clinicId,
                        userId: owner.userId,
                        permissions: owner.permissions,
                      },
                      { text, source: 'speech', sttConfidence: confidence }
                    )
                    .then((result) =>
                      emit({ type: 'interpretation', utteranceId, interpretation: result })
                    )
                    .catch((error: unknown) => log!.warn({ err: error }, 'interpretation failed'));
                },
              },
              emit
            ),
        }
      : undefined,
    voiceSpike: config.VOICE_SPIKE_ENABLED
      ? {
          stt: new DeepgramStt({ apiKey: config.DEEPGRAM_API_KEY!, model: config.DEEPGRAM_MODEL }),
          interpreters: interpretersFromConfig(config),
        }
      : undefined,
  });
  log = app.log;
  interpretation = app.interpretation;
  if (!interpreters)
    app.log.warn('No voice interpreter is configured; utterances are not interpreted');
  if (!stt) app.log.warn('DEEPGRAM_API_KEY is not set; voice streams without speech recognition');
  if (keys.ephemeral) {
    app.log.warn(
      'AUTH_PRIVATE_KEY is not set; tokens are signed with a key that lasts until restart'
    );
  }
  if (!config.DATA_ENCRYPTION_KEY) {
    app.log.warn(
      'DATA_ENCRYPTION_KEY is not set; patient identifiers use a public development key'
    );
  }
  if (!config.MFA_ENCRYPTION_KEY) {
    app.log.warn('MFA_ENCRYPTION_KEY is not set; TOTP secrets use a public development key');
  }
  app.addHook('onClose', async () => pool.end());
  await app.listen({ port: config.PORT, host: config.HOST });
  return app;
}
