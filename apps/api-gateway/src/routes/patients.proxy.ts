import type { FastifyPluginAsync } from 'fastify';

export const patientsProxyRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.all('/patients/*', async (request, reply) => {
    app.requireAuth(request);

    await app.rateLimitGuard({
      tenantId: request.tenantId,
      userId: request.userId,
      endpoint: 'patients',
      role: request.roles?.includes('ADMIN') ? 'admin' : 'authenticated',
    });

    return reply.code(501).send({
      message: 'Patients proxy route not implemented yet.',
    });
  });
};
