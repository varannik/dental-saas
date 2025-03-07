import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { Plan, PlanInterval } from '../models/plan.model';
import * as planRepository from '../repositories/plan.repository';
import { ApiError } from '../utils/error-handler';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-08-16'
});

// Validation schemas
const createPlanSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().required(),
  price: Joi.number().positive().required(),
  interval: Joi.string().valid(PlanInterval.MONTHLY, PlanInterval.YEARLY).required(),
  features: Joi.array().items(Joi.string()).required(),
  isActive: Joi.boolean().default(true)
});

const updatePlanSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string(),
  price: Joi.number().positive(),
  features: Joi.array().items(Joi.string()),
  isActive: Joi.boolean()
});

// Get all active plans
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await planRepository.getAllPlans();
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

// Get plan by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await planRepository.getPlanById(req.params.id);
    
    if (!plan) {
      throw new ApiError(404, 'Plan not found');
    }
    
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// Create a new plan
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const { error, value } = createPlanSchema.validate(req.body);
    if (error) {
      throw new ApiError(400, `Validation error: ${error.message}`);
    }
    
    const { name, description, price, interval, features, isActive } = value;
    
    // Create product in Stripe
    const product = await stripe.products.create({
      name,
      description,
      metadata: {
        features: JSON.stringify(features)
      }
    });
    
    // Create price in Stripe
    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(price * 100), // Convert to cents
      currency: 'usd',
      recurring: {
        interval: interval === PlanInterval.MONTHLY ? 'month' : 'year'
      }
    });
    
    // Create plan in our database
    const newPlan = await planRepository.createPlan({
      name,
      description,
      price,
      interval,
      stripePriceId: stripePrice.id,
      stripeProductId: product.id,
      features,
      isActive
    });
    
    res.status(201).json(newPlan);
  } catch (error) {
    next(error);
  }
});

// Update plan
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const { error, value } = updatePlanSchema.validate(req.body);
    if (error) {
      throw new ApiError(400, `Validation error: ${error.message}`);
    }
    
    const planId = req.params.id;
    
    // Get the current plan
    const currentPlan = await planRepository.getPlanById(planId);
    if (!currentPlan) {
      throw new ApiError(404, 'Plan not found');
    }
    
    // Update product in Stripe if name or description changed
    if (value.name || value.description || value.features) {
      await stripe.products.update(
        currentPlan.stripeProductId,
        {
          name: value.name || currentPlan.name,
          description: value.description || currentPlan.description,
          metadata: {
            features: JSON.stringify(value.features || currentPlan.features)
          }
        }
      );
    }
    
    // Note: We don't update the price in Stripe as it's immutable
    // If price changes, we would create a new price and update our reference
    
    // Update plan in our database
    const updatedPlan = await planRepository.updatePlan(planId, value);
    
    res.json(updatedPlan);
  } catch (error) {
    next(error);
  }
});

// Delete plan (soft delete)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const planId = req.params.id;
    
    // Get the current plan
    const plan = await planRepository.getPlanById(planId);
    if (!plan) {
      throw new ApiError(404, 'Plan not found');
    }
    
    // Archive product in Stripe
    await stripe.products.update(
      plan.stripeProductId,
      { active: false }
    );
    
    // Soft delete in our database
    await planRepository.deletePlan(planId);
    
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export const planRoutes = router; 