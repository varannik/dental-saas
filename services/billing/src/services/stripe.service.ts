import Stripe from 'stripe';
import { config } from '../config';

export const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

export class StripeService {
  async createCustomer(email: string, metadata?: Record<string, string>) {
    return stripe.customers.create({
      email,
      metadata,
    });
  }

  async createSubscription(customerId: string, priceId: string) {
    return stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
  }

  async cancelSubscription(subscriptionId: string) {
    return stripe.subscriptions.cancel(subscriptionId);
  }

  async updateSubscription(subscriptionId: string, priceId: string) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: priceId,
        },
      ],
    });
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    return stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async constructWebhookEvent(payload: Buffer, signature: string) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
  }
}

