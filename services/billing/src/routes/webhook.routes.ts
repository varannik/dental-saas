import { FastifyInstance, FastifyRequest } from 'fastify';
import { StripeService } from '../services/stripe.service';
import { logger } from '../utils/logger';

export async function webhookRoutes(app: FastifyInstance) {
  const stripeService = new StripeService();

  // Need raw body for Stripe webhook verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      done(null, body);
    }
  );

  app.post('/stripe', async (request: FastifyRequest, reply) => {
    const signature = request.headers['stripe-signature'] as string;
    
    try {
      const event = await stripeService.constructWebhookEvent(
        request.body as Buffer,
        signature
      );

      switch (event.type) {
        case 'customer.subscription.created':
          logger.info('Subscription created', event.data.object);
          // TODO: Handle subscription creation
          break;
        case 'customer.subscription.updated':
          logger.info('Subscription updated', event.data.object);
          // TODO: Handle subscription update
          break;
        case 'customer.subscription.deleted':
          logger.info('Subscription deleted', event.data.object);
          // TODO: Handle subscription cancellation
          break;
        case 'invoice.paid':
          logger.info('Invoice paid', event.data.object);
          // TODO: Handle successful payment
          break;
        case 'invoice.payment_failed':
          logger.info('Invoice payment failed', event.data.object);
          // TODO: Handle failed payment
          break;
        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }

      return reply.send({ received: true });
    } catch (err) {
      logger.error('Webhook error:', err);
      return reply.status(400).send({ error: 'Webhook Error' });
    }
  });
}

