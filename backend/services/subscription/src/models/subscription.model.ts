import { Pool } from 'pg';
import { ApiError } from '../utils/error-handler';
import logger from '../utils/logging';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Subscription status enum
export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  TRIALING = 'trialing',
  UNPAID = 'unpaid'
}

// Subscription interface
export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Create subscription table if it doesn't exist
export const initializeSubscriptionTable = async (): Promise<void> => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        plan_id UUID NOT NULL,
        status VARCHAR(20) NOT NULL,
        current_period_start TIMESTAMP NOT NULL,
        current_period_end TIMESTAMP NOT NULL,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
        stripe_subscription_id VARCHAR(100) NOT NULL,
        stripe_customer_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    logger.info('Subscription table initialized');
  } catch (error) {
    logger.error('Failed to initialize subscription table', error);
    throw new ApiError(500, 'Database initialization failed');
  }
};

// Call initialization on module import
initializeSubscriptionTable().catch(err => {
  logger.error('Failed to initialize database', err);
  process.exit(1);
});

// Export the pool for use in repositories
export default pool; 