import { FastifyInstance } from 'fastify';

export async function subscriptionRoutes(app: FastifyInstance) {
  // List available plans
  app.get('/plans', async () => {
    // TODO: Implement
    return { data: [] };
  });

  // Get current subscription
  app.get('/subscriptions', async () => {
    // TODO: Implement
    return { data: null };
  });

  // Create subscription
  app.post('/subscriptions', async () => {
    // TODO: Implement
    return { data: {} };
  });

  // Cancel subscription
  app.delete('/subscriptions/:id', async () => {
    // TODO: Implement
    return { message: 'Subscription cancelled' };
  });

  // Create checkout session
  app.post('/checkout', async () => {
    // TODO: Implement
    return { url: '' };
  });

  // Create portal session
  app.post('/portal', async () => {
    // TODO: Implement
    return { url: '' };
  });
}

