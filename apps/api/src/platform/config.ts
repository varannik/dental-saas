import { z } from 'zod';
import { INTERPRETER_IDS } from '../modules/voice/interpreters.js';

/** An optional secret; an empty value such as `KEY=` in .env counts as unset. */
const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
);

const API_KEY_FOR = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  runbios: 'RUNBIOS_API_KEY',
} as const;

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
    /** The application role (app). It must not bypass row-level security; start-up checks. */
    DATABASE_URL: z.string().url(),
    /** The database owner, for migrations and seeding only. The API itself never uses it. */
    DATABASE_MIGRATION_URL: z.string().url().optional(),
    /** Ed25519 private key, PKCS#8 PEM. Required in production; generated per process otherwise. */
    AUTH_PRIVATE_KEY: optionalSecret,
    AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    VALKEY_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    NEO4J_URI: z.string().min(1),
    NEO4J_USER: z.string().min(1),
    NEO4J_PASSWORD: z.string().min(1),
    VOICE_SPIKE_ENABLED: z.stringbool().default(false),
    DEEPGRAM_API_KEY: optionalSecret,
    DEEPGRAM_MODEL: z.string().min(1).default('nova-3'),
    ANTHROPIC_API_KEY: optionalSecret,
    VOICE_LLM_MODEL: z.string().min(1).default('claude-haiku-4-5'),
    OPENAI_API_KEY: optionalSecret,
    OPENAI_MODEL: z.string().min(1).default('gpt-4.1-mini'),
    /** Run BiOS inference key (bios-…), not the platform key (sk-bios-…). */
    RUNBIOS_API_KEY: optionalSecret,
    RUNBIOS_MODEL: z.string().min(1).default('openai/gpt-4.1-mini'),
    RUNBIOS_BASE_URL: z.string().url().default('https://api.runbios.ai/v1'),
    /** Interpreter used when the client does not choose one. */
    VOICE_INTERPRETER: z.enum(INTERPRETER_IDS).default('anthropic'),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === 'production' && !config.AUTH_PRIVATE_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_PRIVATE_KEY'],
        message: 'required in production; generate one with pnpm --filter @dental/api auth:keygen',
      });
    }
    if (!config.VOICE_SPIKE_ENABLED) return;
    if (config.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['VOICE_SPIKE_ENABLED'],
        message: 'the voice spike is unauthenticated and must not run in production',
      });
    }
    if (!config.DEEPGRAM_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['DEEPGRAM_API_KEY'],
        message: 'required when VOICE_SPIKE_ENABLED is true',
      });
    }
    const defaultKey = API_KEY_FOR[config.VOICE_INTERPRETER];
    if (!config[defaultKey]) {
      context.addIssue({
        code: 'custom',
        path: [defaultKey],
        message: `required when VOICE_SPIKE_ENABLED is true and VOICE_INTERPRETER is ${config.VOICE_INTERPRETER}`,
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Refusing to start. Invalid environment: ${details}`);
  }
  return parsed.data;
}
