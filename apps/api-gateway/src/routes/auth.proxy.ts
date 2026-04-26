import type { FastifyPluginAsync } from 'fastify';

const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';

export const authProxyRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.all('/auth/*', async (request, reply) => {
    await app.rateLimitGuard({
      tenantId: request.tenantId,
      userId: request.userId,
      endpoint: 'auth',
      role: request.userId ? 'authenticated' : 'public',
    });

    const path = request.url.replace(/^\/api\/v1\/auth/, '');
    const targetUrl = `${AUTH_SERVICE_BASE_URL}/auth${path}`;
    const requestIdHeader =
      typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : undefined;
    const headers: Record<string, string> = {
      'content-type': request.headers['content-type'] ?? 'application/json',
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
