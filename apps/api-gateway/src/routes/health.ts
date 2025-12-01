import { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  // Liveness probe
  app.get('/live', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness probe
  app.get('/ready', async () => {
    // Add checks for dependencies (DB, Redis, etc.)
    return { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
        redis: 'ok',
      },
    };
  });

  // Detailed health info
  app.get('/', async () => {
    return {
      status: 'ok',
      version: process.env.npm_package_version || '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  });
}

