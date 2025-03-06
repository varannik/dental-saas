import pool from './subscription.model';
import { ApiError } from '../utils/error-handler';
import logger from '../utils/logging';

// Plan interval enum
export enum PlanInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly'
}

// Plan interface
export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: PlanInterval;
  stripePriceId: string;
  stripeProductId: string;
  features: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Create plan table if it doesn't exist
export const initializePlanTable = async (): Promise<void> => {
  try {
    // Create plans table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        interval VARCHAR(20) NOT NULL,
        stripe_price_id VARCHAR(100) NOT NULL,
        stripe_product_id VARCHAR(100) NOT NULL,
        features JSONB NOT NULL DEFAULT '[]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    // Insert default plans if none exist
    const existingPlans = await pool.query('SELECT COUNT(*) FROM plans');
    if (parseInt(existingPlans.rows[0].count) === 0) {
      await createDefaultPlans();
    }
    
    logger.info('Plan table initialized');
  } catch (error) {
    logger.error('Failed to initialize plan table', error);
    throw new ApiError(500, 'Database initialization failed');
  }
};

// Create default plans
const createDefaultPlans = async (): Promise<void> => {
  try {
    // Basic plan - monthly
    await pool.query(`
      INSERT INTO plans (
        name, description, price, interval, 
        stripe_price_id, stripe_product_id, features
      ) VALUES (
        'Basic', 'Basic plan for small dental practices', 49.99, 'monthly',
        'price_basic_monthly', 'prod_basic',
        '["Patient management", "Appointment scheduling", "Basic reporting"]'
      );
    `);
    
    // Basic plan - yearly
    await pool.query(`
      INSERT INTO plans (
        name, description, price, interval, 
        stripe_price_id, stripe_product_id, features
      ) VALUES (
        'Basic Yearly', 'Basic yearly plan for small dental practices', 499.99, 'yearly',
        'price_basic_yearly', 'prod_basic',
        '["Patient management", "Appointment scheduling", "Basic reporting"]'
      );
    `);
    
    // Professional plan - monthly
    await pool.query(`
      INSERT INTO plans (
        name, description, price, interval, 
        stripe_price_id, stripe_product_id, features
      ) VALUES (
        'Professional', 'Professional plan for growing practices', 99.99, 'monthly',
        'price_pro_monthly', 'prod_pro',
        '["Patient management", "Appointment scheduling", "Advanced reporting", "Voice recognition", "Patient communication"]'
      );
    `);
    
    // Professional plan - yearly
    await pool.query(`
      INSERT INTO plans (
        name, description, price, interval, 
        stripe_price_id, stripe_product_id, features
      ) VALUES (
        'Professional Yearly', 'Professional yearly plan for growing practices', 999.99, 'yearly',
        'price_pro_yearly', 'prod_pro',
        '["Patient management", "Appointment scheduling", "Advanced reporting", "Voice recognition", "Patient communication"]'
      );
    `);
    
    // Enterprise plan - monthly
    await pool.query(`
      INSERT INTO plans (
        name, description, price, interval, 
        stripe_price_id, stripe_product_id, features
      ) VALUES (
        'Enterprise', 'Enterprise plan for large dental networks', 199.99, 'monthly',
        'price_enterprise_monthly', 'prod_enterprise',
        '["Patient management", "Appointment scheduling", "Advanced reporting", "Voice recognition", "Patient communication", "Multi-location support", "Custom integrations", "Dedicated support"]'
      );
    `);
    
    // Enterprise plan - yearly
    await pool.query(`
      INSERT INTO plans (
        name, description, price, interval, 
        stripe_price_id, stripe_product_id, features
      ) VALUES (
        'Enterprise Yearly', 'Enterprise yearly plan for large dental networks', 1999.99, 'yearly',
        'price_enterprise_yearly', 'prod_enterprise',
        '["Patient management", "Appointment scheduling", "Advanced reporting", "Voice recognition", "Patient communication", "Multi-location support", "Custom integrations", "Dedicated support"]'
      );
    `);
    
    logger.info('Default plans created');
  } catch (error) {
    logger.error('Failed to create default plans', error);
    throw new ApiError(500, 'Failed to create default plans');
  }
};

// Call initialization on module import
initializePlanTable().catch(err => {
  logger.error('Failed to initialize plan table', err);
});

export default {
  initializePlanTable
}; 