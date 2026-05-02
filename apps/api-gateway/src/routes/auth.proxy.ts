import type { FastifyPluginAsync } from 'fastify';

const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export const authProxyRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.all('/auth/*', async (request, reply) => {
    await app.rateLimitGuard({
      tenantId: request.tenantId,
      userId: request.userId,
      endpoint: 'auth',
      role: request.userId ? 'authenticated' : 'public',
    });

    // Match users/patients proxies: strip `/api/v1` when present; under the `/api/v1` prefix,
    // `request.url` is often `/auth/register` (no `/api/v1` prefix), so stripping only
    // `/api/v1/auth` produced `/auth/register` and doubled `/auth` upstream → 404.
    const pathOnly = request.url.split('?')[0] ?? request.url;
    const path = pathOnly.replace(/^\/api\/v1/, '') || '/';
    const targetUrl = `${AUTH_SERVICE_BASE_URL}${path}`;
    const requestIdHeader =
      typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : undefined;
    const contentTypeHeader = request.headers['content-type'];
    const headers: Record<string, string> = {
      ...(typeof contentTypeHeader === 'string' ? { 'content-type': contentTypeHeader } : {}),
      ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
      ...(requestIdHeader ? { 'x-request-id': requestIdHeader } : {}),
    };

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body
            ? JSON.stringify(request.body)
            : undefined,
    });

    const contentType = response.headers.get('content-type') ?? 'application/json';
    reply.code(response.status).header('content-type', contentType);
    return reply.send(await response.text());
  });
};
