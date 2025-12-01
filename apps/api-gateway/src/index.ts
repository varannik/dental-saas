import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import proxy from '@fastify/http-proxy';
import { config } from './config';
import { logger } from './utils/logger';
import { healthRoutes } from './routes/health';

const app = Fastify({
  logger: true,
});

// Register plugins
async function bootstrap() {
  // CORS
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // JWT
  await app.register(jwt, {
    secret: config.jwtSecret,
  });

  // Health check routes
  await app.register(healthRoutes, { prefix: '/health' });

  // Proxy to microservices
  await app.register(proxy, {
    upstream: config.services.auth,
    prefix: '/api/auth',
    rewritePrefix: '/api/auth',
  });

  await app.register(proxy, {
    upstream: config.services.users,
    prefix: '/api/users',
    rewritePrefix: '/api/users',
  });

  await app.register(proxy, {
    upstream: config.services.billing,
    prefix: '/api/billing',
    rewritePrefix: '/api/billing',
  });

  await app.register(proxy, {
    upstream: config.services.notifications,
    prefix: '/api/notifications',
    rewritePrefix: '/api/notifications',
  });

  // Start server
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`API Gateway running on port ${config.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

bootstrap();

