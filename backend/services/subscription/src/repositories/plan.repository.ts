import pool from '../models/subscription.model';
import { Plan, PlanInterval } from '../models/plan.model';
import { ApiError } from '../utils/error-handler';
import logger from '../utils/logging';

// Get all active plans
export const getAllPlans = async (): Promise<Plan[]> => {
  try {
    const result = await pool.query(
      'SELECT * FROM plans WHERE is_active = true ORDER BY price ASC'
    );

    return result.rows.map(mapRowToPlan);
  } catch (error) {
    logger.error('Failed to get all plans', error);
    throw new ApiError(500, 'Failed to retrieve plans');
  }
};

// Get plan by ID
export const getPlanById = async (id: string): Promise<Plan | null> => {
  try {
    const result = await pool.query(
      'SELECT * FROM plans WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToPlan(result.rows[0]);
  } catch (error) {
    logger.error(`Failed to get plan with ID ${id}`, error);
    throw new ApiError(500, 'Failed to retrieve plan');
  }
};

// Create a new plan
export const createPlan = async (plan: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan> => {
  try {
    const result = await pool.query(
      `INSERT INTO plans (
        name, description, price, interval, 
        stripe_price_id, stripe_product_id, features, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *`,
      [
        plan.name,
        plan.description,
        plan.price,
        plan.interval,
        plan.stripePriceId,
        plan.stripeProductId,
        JSON.stringify(plan.features),
        plan.isActive
      ]
    );

    return mapRowToPlan(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create plan', error);
    throw new ApiError(500, 'Failed to create plan');
  }
};

// Update plan
export const updatePlan = async (id: string, updates: Partial<Plan>): Promise<Plan> => {
  try {
    // Build the SET clause dynamically based on provided updates
    const setValues: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Map JavaScript property names to database column names
    const columnMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      price: 'price',
      interval: 'interval',
      stripePriceId: 'stripe_price_id',
      stripeProductId: 'stripe_product_id',
      isActive: 'is_active'
    };

    // Add each update to the SET clause
    for (const [key, value] of Object.entries(updates)) {
      if (key in columnMap) {
        setValues.push(`${columnMap[key]} = $${paramIndex}`);
        queryParams.push(value);
        paramIndex++;
      } else if (key === 'features') {
        setValues.push(`features = $${paramIndex}`);
        queryParams.push(JSON.stringify(value));
        paramIndex++;
      }
    }

    // Always update the updated_at timestamp
    setValues.push(`updated_at = NOW()`);

    // Add the ID as the last parameter
    queryParams.push(id);

    // Execute the update query
    const result = await pool.query(
      `UPDATE plans 
       SET ${setValues.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      queryParams
    );

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Plan not found');
    }

    return mapRowToPlan(result.rows[0]);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Failed to update plan ${id}`, error);
    throw new ApiError(500, 'Failed to update plan');
  }
};

// Delete plan (soft delete by setting isActive to false)
export const deletePlan = async (id: string): Promise<void> => {
  try {
    const result = await pool.query(
      `UPDATE plans 
       SET is_active = false, updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Plan not found');
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Failed to delete plan ${id}`, error);
    throw new ApiError(500, 'Failed to delete plan');
  }
};

// Helper function to map database row to Plan interface
const mapRowToPlan = (row: any): Plan => {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: parseFloat(row.price),
    interval: row.interval as PlanInterval,
    stripePriceId: row.stripe_price_id,
    stripeProductId: row.stripe_product_id,
    features: Array.isArray(row.features) ? row.features : JSON.parse(row.features),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export default {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan
}; 