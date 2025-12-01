import Fastify from 'fastify';
import { config } from './config';
import { logger } from './utils/logger';
import { notificationRoutes } from './routes/notification.routes';

const app = Fastify({ logger: true });

async function bootstrap() {
  // Routes
  await app.register(notificationRoutes, { prefix: '/api/notifications' });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Notifications service running on port ${config.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

bootstrap();

