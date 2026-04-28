import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

const CLINICAL_SERVICE_BASE_URL = process.env.CLINICAL_SERVICE_URL ?? 'http://127.0.0.1:4003';

export const patientsProxyRoute: FastifyPluginAsync = async (app): Promise<void> => {
  const proxyRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    app.requireAuth(request);

    await app.rateLimitGuard({
      tenantId: request.tenantId,
      userId: request.userId,
      endpoint: 'patients',
      role: request.roles?.includes('ADMIN') ? 'admin' : 'authenticated',
    });

    const path = request.url.replace(/^\/api\/v1/, '');
    const targetUrl = `${CLINICAL_SERVICE_BASE_URL}${path}`;
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
  };

  app.all('/patients', proxyRequest);
  app.all('/patients/*', proxyRequest);
};
