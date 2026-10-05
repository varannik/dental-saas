import { DeepgramStt } from './modules/voice/adapters/deepgram.js';
import { interpretersFromConfig } from './modules/voice/interpreters.js';
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

  const app = await buildServer({
    logger: { level: config.LOG_LEVEL },
    corsOrigin: config.CORS_ORIGIN,
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
    voiceSpike: config.VOICE_SPIKE_ENABLED
      ? {
          stt: new DeepgramStt({ apiKey: config.DEEPGRAM_API_KEY!, model: config.DEEPGRAM_MODEL }),
          interpreters: interpretersFromConfig(config),
        }
      : undefined,
  });
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
