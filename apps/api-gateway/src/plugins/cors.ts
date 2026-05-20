import cors from '@fastify/cors';
import type { FastifyCorsOptions } from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { firstHeader } from '../lib/http-header.js';

/**
 * Browser origins commonly used for local Next.js against the gateway on :4000.
 */
const LOCAL_DEV_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
];

function parseExplicitOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

function isAllowedLocalDevOrigin(origin: string): boolean {
  return LOCAL_DEV_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

/**
 * - **`CORS_ORIGINS` set:** allow only those origins (comma-separated).
 * - **Unset:** reflect any request `Origin` (`origin: true`).
 */
export function resolveCorsOrigin(): FastifyCorsOptions['origin'] {
  const explicit = parseExplicitOrigins(process.env.CORS_ORIGINS);
  if (explicit.length > 0) {
    return explicit;
  }
  return true;
}

/** Used when `CORS_ORIGINS` is unset and you need production-style LAN allowlisting. */
export function isLocalDevBrowserOrigin(origin: string): boolean {
  return isAllowedLocalDevOrigin(origin);
}

/**
 * Whether the browser `Origin` may receive `Access-Control-Allow-Origin`.
 * Mirrors `@fastify/cors` rules plus local-dev patterns when reflecting all origins.
 */
export function isOriginAllowed(origin: string): boolean {
  const config = resolveCorsOrigin();
  if (config === true) {
    return isAllowedLocalDevOrigin(origin);
  }
  if (Array.isArray(config)) {
    return config.some((entry) => {
      if (typeof entry === 'string') {
        return entry === origin;
      }
      if (entry instanceof RegExp) {
        return entry.test(origin);
      }
      return false;
    });
  }
  return false;
}

/** Value for `Access-Control-Allow-Origin` (always the request origin when allowed). */
export function getReflectOrigin(requestOrigin: string | undefined): string | null {
  if (typeof requestOrigin !== 'string' || requestOrigin.length === 0) {
    return null;
  }
  return isOriginAllowed(requestOrigin) ? requestOrigin : null;
}

function applyCorsResponseHeaders(
  requestOrigin: string | undefined,
  reply: { getHeader: (name: string) => unknown; header: (name: string, value: string) => void }
): void {
  const allowedOrigin = getReflectOrigin(requestOrigin);
  if (!allowedOrigin) {
    return;
  }
  if (reply.getHeader('access-control-allow-origin')) {
    return;
  }
  reply.header('Access-Control-Allow-Origin', allowedOrigin);
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Vary', 'Origin');
}

const corsPluginImpl: FastifyPluginAsync = async (app): Promise<void> => {
  await app.register(cors, {
    origin: resolveCorsOrigin(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // Proxied routes under `/api/v1` can miss plugin headers; enforce on every response.
  app.addHook('onSend', async (request, reply, payload) => {
    applyCorsResponseHeaders(firstHeader(request.headers.origin), reply);
    return payload;
  });
};

export const corsPlugin = fp(corsPluginImpl, {
  name: 'gateway-cors-plugin',
});
