import { z } from 'zod';

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z.string().url(),
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
    DEEPGRAM_API_KEY: z.string().min(1).optional(),
    DEEPGRAM_MODEL: z.string().min(1).default('nova-3'),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    VOICE_LLM_MODEL: z.string().min(1).default('claude-haiku-4-5'),
  })
  .superRefine((config, context) => {
    if (!config.VOICE_SPIKE_ENABLED) return;
    if (config.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['VOICE_SPIKE_ENABLED'],
        message: 'the voice spike is unauthenticated and must not run in production',
      });
    }
    for (const key of ['DEEPGRAM_API_KEY', 'ANTHROPIC_API_KEY'] as const) {
      if (!config[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'required when VOICE_SPIKE_ENABLED is true',
        });
      }
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
