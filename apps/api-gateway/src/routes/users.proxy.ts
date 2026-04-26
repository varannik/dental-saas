import type { FastifyPluginAsync } from 'fastify';

const USERS_SERVICE_BASE_URL = process.env.USERS_SERVICE_URL ?? 'http://localhost:4002';

export const usersProxyRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.all('/users/*', async (request, reply) => {
    app.requireAuth(request);

    await app.rateLimitGuard({
      tenantId: request.tenantId,
      userId: request.userId,
      endpoint: 'users',
      role: request.roles?.includes('ADMIN') ? 'admin' : 'authenticated',
    });

    const path = request.url.replace(/^\/api\/v1\/users/, '');
    const targetUrl = `${USERS_SERVICE_BASE_URL}/users${path}`;
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
