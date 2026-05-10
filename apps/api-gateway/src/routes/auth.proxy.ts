import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { firstHeader } from '../lib/http-header.js';
import { registerUpstreamProxyRoutes } from '../lib/register-upstream-proxy-routes.js';

const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

/** Strip `/api/v1` when present; pathname only (defensive if `url` ever includes a full URL). */
function upstreamAuthPath(rawUrl: string): string {
  const pathAndQuery = rawUrl.split('?')[0] ?? rawUrl;
  let pathname = pathAndQuery;
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      /* keep pathname as-is */
    }
  }
  return pathname.replace(/^\/api\/v1/, '') || '/';
}

function serializeProxyBody(method: string, body: unknown): string | undefined {
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body === 'string') {
    return body;
  }
  return JSON.stringify(body);
}

export const authProxyRoute: FastifyPluginAsync = async (app): Promise<void> => {
  const proxyAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await app.rateLimitGuard({
      tenantId: request.tenantId,
      userId: request.userId,
      endpoint: 'auth',
      role: request.userId ? 'authenticated' : 'public',
    });

    // Match users/patients proxies: strip `/api/v1` when present; under the `/api/v1` prefix,
    // `request.url` is often `/auth/register` (no `/api/v1` prefix), so stripping only
    // `/api/v1/auth` produced `/auth/register` and doubled `/auth` upstream → 404.
    const path = upstreamAuthPath(request.url);
    const targetUrl = `${AUTH_SERVICE_BASE_URL}${path}`;
    const contentTypeHeader = firstHeader(request.headers['content-type']);
    const authorizationHeader = firstHeader(request.headers.authorization);
    const requestIdHeader = firstHeader(request.headers['x-request-id']);
    const headers: Record<string, string> = {
      ...(contentTypeHeader ? { 'content-type': contentTypeHeader } : {}),
      ...(authorizationHeader ? { authorization: authorizationHeader } : {}),
      ...(requestIdHeader ? { 'x-request-id': requestIdHeader } : {}),
    };

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: serializeProxyBody(request.method, request.body),
    });

    const contentType = response.headers.get('content-type') ?? 'application/json';
    reply.code(response.status).header('content-type', contentType);
    return reply.send(await response.text());
  };

  registerUpstreamProxyRoutes(app, ['/auth/*'], proxyAuth);
};
