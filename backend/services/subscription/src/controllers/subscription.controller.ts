import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { Subscription, SubscriptionStatus } from '../models/subscription.model';
import * as subscriptionRepository from '../repositories/subscription.repository';
import * as planRepository from '../repositories/plan.repository';
import { ApiError } from '../utils/error-handler';
import logger from '../utils/logging';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-08-16'
});

// Validation schemas
const createSubscriptionSchema = Joi.object({
  tenantId: Joi.string().uuid().required(),
  planId: Joi.string().uuid().required(),
  stripeToken: Joi.string().required()
});

const updateSubscriptionSchema = Joi.object({
  planId: Joi.string().uuid(),
  cancelAtPeriodEnd: Joi.boolean()
});

// Get subscription by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscription = await subscriptionRepository.getSubscriptionById(req.params.id);
    
    if (!subscription) {
      throw new ApiError(404, 'Subscription not found');
    }
    
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

// Get tenant's subscription
router.get('/tenant/:tenantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscription = await subscriptionRepository.getSubscriptionByTenantId(req.params.tenantId);
    
    if (!subscription) {
      throw new ApiError(404, 'No active subscription found for this tenant');
    }
    
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

// Create a new subscription
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const { error, value } = createSubscriptionSchema.validate(req.body);
    if (error) {
      throw new ApiError(400, `Validation error: ${error.message}`);
    }
    
    const { tenantId, planId, stripeToken } = value;
    
    // Get the plan details
    const plan = await planRepository.getPlanById(planId);
    if (!plan) {
      throw new ApiError(404, 'Plan not found');
    }
    
    // Create or get customer in Stripe
    let customerId;
    const existingCustomers = await stripe.customers.list({
      email: `tenant-${tenantId}@dentalcare.example.com`, // Using tenant ID as part of email
      limit: 1
    });
    
    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: `tenant-${tenantId}@dentalcare.example.com`,
        source: stripeToken,
        metadata: {
          tenantId
        }
      });
      customerId = customer.id;
    }
    
    // Create subscription in Stripe
    const stripeSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      metadata: {
        tenantId,
        planId
      }
    });
    
    // Create subscription in our database
    const newSubscription = await subscriptionRepository.createSubscription({
      tenantId,
      planId,
      status: stripeSubscription.status as SubscriptionStatus,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: customerId
    });
    
    res.status(201).json(newSubscription);
  } catch (error) {
    next(error);
  }
});

// Update subscription
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const { error, value } = updateSubscriptionSchema.validate(req.body);
    if (error) {
      throw new ApiError(400, `Validation error: ${error.message}`);
    }
    
    const { planId, cancelAtPeriodEnd } = value;
    const subscriptionId = req.params.id;
    
    // Get the current subscription
    const subscription = await subscriptionRepository.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new ApiError(404, 'Subscription not found');
    }
    
    // Handle plan change
    if (planId && planId !== subscription.planId) {
      // Get the new plan
      const newPlan = await planRepository.getPlanById(planId);
      if (!newPlan) {
        throw new ApiError(404, 'New plan not found');
      }
      
      // Update in Stripe
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{
          id: (await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId)).items.data[0].id,
          price: newPlan.stripePriceId
        }],
        metadata: {
          tenantId: subscription.tenantId,
          planId
        }
      });
      
      // Update in our database
      await subscriptionRepository.updateSubscription(subscriptionId, { planId });
    }
    
    // Handle cancellation update
    if (cancelAtPeriodEnd !== undefined) {
      // Update in Stripe
      if (cancelAtPeriodEnd) {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true
        });
      } else {
        // Resume subscription
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: false
        });
      }
      
      // Update in our database
      await subscriptionRepository.cancelSubscription(subscriptionId, cancelAtPeriodEnd);
    }
    
    // Get the updated subscription
    const updatedSubscription = await subscriptionRepository.getSubscriptionById(subscriptionId);
    res.json(updatedSubscription);
  } catch (error) {
    next(error);
  }
});

// Cancel subscription immediately
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptionId = req.params.id;
    
    // Get the current subscription
    const subscription = await subscriptionRepository.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new ApiError(404, 'Subscription not found');
    }
    
    // Cancel in Stripe immediately
    await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    
    // Cancel in our database
    await subscriptionRepository.cancelSubscription(subscriptionId, false);
    
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Stripe webhook handler for subscription events
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ''
      );
    } catch (err) {
      throw new ApiError(400, `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    // Handle the event
    switch (event.type) {
      case 'invoice.payment_succeeded':
        // Update subscription status to active
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        // Update subscription status to past_due
        await handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.updated':
        // Update subscription details
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        // Mark subscription as canceled
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        logger.info(`Unhandled event type ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

// Helper functions for webhook handling
async function handlePaymentSucceeded(invoice: any) {
  try {
    if (invoice.subscription) {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      
      if (subscription.metadata.tenantId) {
        const existingSubscription = await subscriptionRepository.getSubscriptionByTenantId(subscription.metadata.tenantId);
        
        if (existingSubscription) {
          await subscriptionRepository.updateSubscription(existingSubscription.id, {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000)
          });
        }
      }
    }
  } catch (error) {
    logger.error('Error handling payment succeeded webhook', error);
  }
}

async function handlePaymentFailed(invoice: any) {
  try {
    if (invoice.subscription) {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      
      if (subscription.metadata.tenantId) {
        const existingSubscription = await subscriptionRepository.getSubscriptionByTenantId(subscription.metadata.tenantId);
        
        if (existingSubscription) {
          await subscriptionRepository.updateSubscription(existingSubscription.id, {
            status: SubscriptionStatus.PAST_DUE
          });
        }
      }
    }
  } catch (error) {
    logger.error('Error handling payment failed webhook', error);
  }
}

async function handleSubscriptionUpdated(stripeSubscription: any) {
  try {
    if (stripeSubscription.metadata.tenantId) {
      const existingSubscription = await subscriptionRepository.getSubscriptionByTenantId(stripeSubscription.metadata.tenantId);
      
      if (existingSubscription) {
        await subscriptionRepository.updateSubscription(existingSubscription.id, {
          status: stripeSubscription.status as SubscriptionStatus,
          currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
        });
      }
    }
  } catch (error) {
    logger.error('Error handling subscription updated webhook', error);
  }
}

async function handleSubscriptionDeleted(stripeSubscription: any) {
  try {
    if (stripeSubscription.metadata.tenantId) {
      const existingSubscription = await subscriptionRepository.getSubscriptionByTenantId(stripeSubscription.metadata.tenantId);
      
      if (existingSubscription) {
        await subscriptionRepository.updateSubscription(existingSubscription.id, {
          status: SubscriptionStatus.CANCELED
        });
      }
    }
  } catch (error) {
    logger.error('Error handling subscription deleted webhook', error);
  }
}

export const subscriptionRoutes = router;