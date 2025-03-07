/**
 * Tenant Routes
 */
const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');
const { authenticateJWT, requireRole } = require('../middlewares/auth');
const { registerValidation } = require('../middlewares/validation');

/**
 * @swagger
 * /api/auth/tenants/register:
 *   post:
 *     summary: Register new tenant
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
 *               password:
 *                 type: string
 *               plan:
 *                 type: string
 *                 enum: [free, basic, premium, enterprise]
 *     responses:
 *       201:
 *         description: Tenant registered successfully
 *       409:
 *         description: Domain already registered
 */
router.post('/register', registerValidation, tenantController.registerTenant);

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
 *         required: true
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant details
 *       404:
 *         description: Tenant not found
 */
router.get('/:tenantId', authenticateJWT, requireRole(['admin']), tenantController.getTenantDetails);

/**
 * @swagger
 * /api/auth/tenants:
 *   get:
 *     summary: Get current tenant details
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant details
 *       404:
 *         description: Tenant not found
 */
router.get('/', authenticateJWT, tenantController.getTenantDetails);

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
 *         required: true
 *         description: Tenant ID
 *     requestBody:
 *       required: true
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
 *       404:
 *         description: Tenant not found
 */
router.put('/:tenantId', authenticateJWT, requireRole(['admin']), tenantController.updateTenant);

/**
 * @swagger
 * /api/auth/tenants/{tenantId}:
 *   delete:
 *     summary: Deactivate tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *         required: true
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant deactivated successfully
 *       404:
 *         description: Tenant not found
 */
router.delete('/:tenantId', authenticateJWT, requireRole(['admin']), tenantController.deactivateTenant);

module.exports = router; 