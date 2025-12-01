import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { config } from './config';
import { logger } from './utils/logger';
import { authRoutes } from './routes/auth.routes';
import { errorHandler } from './middleware/error.middleware';

const app = Fastify({ logger: true });

async function bootstrap() {
  // Register plugins
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  await app.register(cookie, {
    secret: config.cookieSecret,
    parseOptions: {},
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // Start server
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Auth service running on port ${config.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

bootstrap();

