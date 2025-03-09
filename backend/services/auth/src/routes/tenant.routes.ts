import { Router } from 'express';
import { TenantController } from '../controllers/tenant.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { Role } from '../types/user.types';
import { RedisService } from '../services/redis.service';

const router = Router();
const redisService = new RedisService();
const authMiddleware = new AuthMiddleware(redisService);

// Initialize controller
// In a real app, you'd use proper dependency injection
const tenantController = new TenantController(
  // Dependencies would be injected here
);

/**
 * @swagger
 * /api/auth/tenants/register:
 *   post:
 *     summary: Register a new tenant with initial admin user
 *     tags: [Tenants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - domain
 *               - email
 *               - password
 *               - plan
 *             properties:
 *               name:
 *                 type: string
 *               domain:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               plan:
 *                 type: string
 *                 enum: [free, basic, premium, enterprise]
 *     responses:
 *       201:
 *         description: Tenant registered successfully
 */
router.post('/register', tenantController.registerTenant);

/**
 * @swagger
 * /api/auth/tenants:
 *   get:
 *     summary: Get all tenants (super admin only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of tenants
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires super admin
 */
router.get(
  '/',
  authMiddleware.authenticateJWT,
  // Special case for super admin that manages all tenants
  tenantController.getAllTenants
);

/**
 * @swagger
 * /api/auth/tenants/current:
 *   get:
 *     summary: Get current tenant details
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant details
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/current',
  authMiddleware.authenticateJWT,
  tenantController.getCurrentTenant
);

/**
 * @swagger
 * /api/auth/tenants/{tenantId}:
 *   get:
 *     summary: Get tenant details
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     responses:
 *       200:
 *         description: Tenant details
 */
router.get(
  '/:tenantId',
  authMiddleware.authenticateJWT,
  authMiddleware.requireSameTenant,
  tenantController.getTenantById
);

/**
 * @swagger
 * /api/auth/tenants/{tenantId}:
 *   put:
 *     summary: Update tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               subscriptionPlan:
 *                 type: string
 *                 enum: [free, basic, premium, enterprise]
 *               subscriptionStatus:
 *                 type: string
 *                 enum: [active, inactive, pending, cancelled]
 *     responses:
 *       200:
 *         description: Tenant updated successfully
 */
router.put(
  '/:tenantId',
  authMiddleware.authenticateJWT,
  authMiddleware.requireRole([Role.ADMIN]),
  authMiddleware.requireSameTenant,
  tenantController.updateTenant
);

/**
 * @swagger
 * /api/auth/tenants/{tenantId}/status:
 *   patch:
 *     summary: Update tenant status (activate/deactivate)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Tenant status updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Tenant not found
 */
router.patch(
  '/:tenantId/status',
  authMiddleware.authenticateJWT,
  // Special super admin case
  tenantController.updateTenantStatus
);

/**
 * @swagger
 * /api/auth/tenants/{tenantId}/subscription:
 *   patch:
 *     summary: Update tenant subscription
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subscriptionPlan
 *             properties:
 *               subscriptionPlan:
 *                 type: string
 *                 enum: [free, basic, premium, enterprise]
 *               subscriptionStatus:
 *                 type: string
 *                 enum: [active, inactive, pending, cancelled]
 *     responses:
 *       200:
 *         description: Tenant subscription updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Tenant not found
 */
router.patch(
  '/:tenantId/subscription',
  authMiddleware.authenticateJWT,
  // Special super admin case
  tenantController.updateTenantSubscription
);

/**
 * @swagger
 * /api/auth/tenants/domain-available:
 *   get:
 *     summary: Check if a domain is available
 *     tags: [Tenants]
 *     parameters:
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Domain availability status
 */
router.get(
  '/domain-available',
  tenantController.checkDomainAvailability
);

/**
 * @swagger
 * /api/auth/tenants/{tenantId}/stats:
 *   get:
 *     summary: Get tenant statistics
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     responses:
 *       200:
 *         description: Tenant statistics
 */
router.get(
  '/:tenantId/stats',
  authMiddleware.authenticateJWT,
  authMiddleware.requireRole([Role.ADMIN]),
  authMiddleware.requireSameTenant,
  tenantController.getTenantStats
);

export default router; 