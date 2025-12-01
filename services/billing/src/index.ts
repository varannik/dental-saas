import Fastify from 'fastify';
import { config } from './config';
import { logger } from './utils/logger';
import { subscriptionRoutes } from './routes/subscription.routes';
import { webhookRoutes } from './routes/webhook.routes';

const app = Fastify({ logger: true });

async function bootstrap() {
  // Routes
  await app.register(subscriptionRoutes, { prefix: '/api/billing' });
  await app.register(webhookRoutes, { prefix: '/api/billing/webhooks' });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Billing service running on port ${config.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

bootstrap();

