import cors from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Explicit browser origins when `CORS_ORIGINS` is set (comma-separated).
 * When unset in **non-production**, we use `origin: true` so the gateway **reflects** the request
 * `Origin` header — otherwise any host not listed (LAN IP, odd ports, typos) gets **no**
 * `Access-Control-Allow-Origin` and the preflight looks like “missing header”.
 *
 * **Production:** set `CORS_ORIGINS` to an explicit list (do not rely on reflection).
 */
const DEFAULT_PRODUCTION_FALLBACK_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:3000',
  'http://[::1]:3001',
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i,
] as const;

function resolveCorsOrigin(): boolean | (string | RegExp)[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) {
    const list = raw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (list.length === 0) {
      return true;
    }
    return list;
  }

  if (process.env.NODE_ENV === 'production') {
    return [...DEFAULT_PRODUCTION_FALLBACK_ORIGINS];
  }

  return true;
}

export const corsPlugin: FastifyPluginAsync = async (app): Promise<void> => {
  await app.register(cors, {
    origin: resolveCorsOrigin(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  });
};
