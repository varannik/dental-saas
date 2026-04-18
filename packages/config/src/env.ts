import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const NODE_ENV_VALUES = ['development', 'test', 'staging', 'production'] as const;

const optionalString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().min(1).optional());

let dotenvLoaded = false;
let cachedEnv: Env | null = null;

function loadEnvFiles(): void {
  if (dotenvLoaded) return;

  const runtimeNodeEnv =
    typeof process.env.NODE_ENV === 'string' ? process.env.NODE_ENV.trim() : undefined;
  const scopedNodeEnv = runtimeNodeEnv && runtimeNodeEnv.length > 0 ? runtimeNodeEnv : undefined;

  const dotenvPaths = [
    scopedNodeEnv ? `.env.${scopedNodeEnv}.local` : undefined,
    '.env.local',
    scopedNodeEnv ? `.env.${scopedNodeEnv}` : undefined,
    '.env',
  ].filter((path): path is string => Boolean(path));

  // Keep injected runtime variables untouched.
  for (const path of dotenvPaths) {
    loadDotenv({ path, override: false });
  }

  dotenvLoaded = true;
}

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
  JWT_ISSUER: z.string().default('dental-saas'),

  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),

  DEEPGRAM_API_KEY: optionalString,
  DEEPGRAM_MODEL: z.string().default('nova-3'),

  S3_ENDPOINT: optionalString.pipe(z.string().url().optional()),
  S3_ACCESS_KEY: optionalString,
  S3_SECRET_KEY: optionalString,
  S3_BUCKET_NAME: z.string().default('dental-saas-local'),
  S3_REGION: z.string().default('eu-central-1'),

  AWS_REGION: z.string().default('eu-central-1'),
  AWS_DEFAULT_REGION: z.string().default('eu-central-1'),
  LOCALSTACK_ENDPOINT: optionalString.pipe(z.string().url().optional()),

  LANGSMITH_API_KEY: optionalString,
  LANGSMITH_PROJECT: z.string().default('dental-saas'),
  SENTRY_DSN: optionalString,
});

export type Env = z.infer<typeof envSchema>;

interface LoadEnvOptions {
  reload?: boolean;
}

export function loadEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: LoadEnvOptions = {}
): Env {
  if (options.reload) {
    dotenvLoaded = false;
    cachedEnv = null;
  }

  if (source === process.env) {
    loadEnvFiles();
  }

  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const issues = result.error.issues
    .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export function getEnv(options: LoadEnvOptions = {}): Env {
  if (!cachedEnv || options.reload) {
    cachedEnv = loadEnv(process.env, options);
  }

  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
  dotenvLoaded = false;
}

export const env = getEnv();
