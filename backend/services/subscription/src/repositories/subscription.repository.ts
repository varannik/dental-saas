import pool, { Subscription, SubscriptionStatus } from '../models/subscription.model';
import { ApiError } from '../utils/error-handler';
import logger from '../utils/logging';

// Create a new subscription
export const createSubscription = async (subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription> => {
  try {
    const result = await pool.query(
      `INSERT INTO subscriptions (
        tenant_id, plan_id, status, current_period_start, 
        current_period_end, cancel_at_period_end, 
        stripe_subscription_id, stripe_customer_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *`,
      [
        subscription.tenantId,
        subscription.planId,
        subscription.status,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.cancelAtPeriodEnd,
        subscription.stripeSubscriptionId,
        subscription.stripeCustomerId
      ]
    );

    return mapRowToSubscription(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create subscription', error);
    throw new ApiError(500, 'Failed to create subscription');
  }
};

// Get subscription by ID
export const getSubscriptionById = async (id: string): Promise<Subscription | null> => {
  try {
    const result = await pool.query(
      'SELECT * FROM subscriptions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToSubscription(result.rows[0]);
  } catch (error) {
    logger.error(`Failed to get subscription with ID ${id}`, error);
    throw new ApiError(500, 'Failed to get subscription');
  }
};

// Get subscription by tenant ID
export const getSubscriptionByTenantId = async (tenantId: string): Promise<Subscription | null> => {
  try {
    const result = await pool.query(
      'SELECT * FROM subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToSubscription(result.rows[0]);
  } catch (error) {
    logger.error(`Failed to get subscription for tenant ${tenantId}`, error);
    throw new ApiError(500, 'Failed to get subscription');
  }
};

// Update subscription
export const updateSubscription = async (id: string, updates: Partial<Subscription>): Promise<Subscription> => {
  try {
    // Build the SET clause dynamically based on provided updates
    const setValues: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Map JavaScript property names to database column names
    const columnMap: Record<string, string> = {
      tenantId: 'tenant_id',
      planId: 'plan_id',
      status: 'status',
      currentPeriodStart: 'current_period_start',
      currentPeriodEnd: 'current_period_end',
      cancelAtPeriodEnd: 'cancel_at_period_end',
      stripeSubscriptionId: 'stripe_subscription_id',
      stripeCustomerId: 'stripe_customer_id'
    };

    // Add each update to the SET clause
    for (const [key, value] of Object.entries(updates)) {
      if (key in columnMap) {
        setValues.push(`${columnMap[key]} = $${paramIndex}`);
        queryParams.push(value);
        paramIndex++;
      }
    }

    // Always update the updated_at timestamp
    setValues.push(`updated_at = NOW()`);

    // Add the ID as the last parameter
    queryParams.push(id);

    // Execute the update query
    const result = await pool.query(
      `UPDATE subscriptions 
       SET ${setValues.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      queryParams
    );

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Subscription not found');
    }

    return mapRowToSubscription(result.rows[0]);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Failed to update subscription ${id}`, error);
    throw new ApiError(500, 'Failed to update subscription');
  }
};

// Cancel subscription
export const cancelSubscription = async (id: string, cancelAtPeriodEnd: boolean): Promise<Subscription> => {
  try {
    const result = await pool.query(
      `UPDATE subscriptions 
       SET status = $1, cancel_at_period_end = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [cancelAtPeriodEnd ? SubscriptionStatus.ACTIVE : SubscriptionStatus.CANCELED, cancelAtPeriodEnd, id]
    );

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Subscription not found');
    }

    return mapRowToSubscription(result.rows[0]);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Failed to cancel subscription ${id}`, error);
    throw new ApiError(500, 'Failed to cancel subscription');
  }
};

// Helper function to map database row to Subscription interface
const mapRowToSubscription = (row: any): Subscription => {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planId: row.plan_id,
    status: row.status as SubscriptionStatus,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export default {
  createSubscription,
  getSubscriptionById,
  getSubscriptionByTenantId,
  updateSubscription,
  cancelSubscription
}; 