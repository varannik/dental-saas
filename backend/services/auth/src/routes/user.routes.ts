import { Router } from 'express';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { validate, createUserValidation, updateUserValidation } from '../middleware/validation.middleware';
import { Role } from '../types/user.types';
import { RedisService } from '../services/redis.service';

const router = Router();
const redisService = new RedisService();
const authMiddleware = new AuthMiddleware(redisService);

// Controller will be properly injected in a real implementation
const userController = {} as any;

/**
 * @swagger
 * /api/auth/users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, dentist, assistant, receptionist]
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 */
router.post(
  '/', 
  authMiddleware.authenticateJWT, 
  authMiddleware.requireRole([Role.ADMIN]),
  validate(createUserValidation),
  userController.createUser
);

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     summary: Get all users for tenant
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get(
  '/',
  authMiddleware.authenticateJWT,
  userController.getAllUsers
);

/**
 * @swagger
 * /api/auth/users/{userId}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     responses:
 *       200:
 *         description: User details
 */
router.get(
  '/:userId',
  authMiddleware.authenticateJWT,
  authMiddleware.requireSameUser,
  userController.getUserById
);

/**
 * @swagger
 * /api/auth/users/{userId}:
 *   put:
 *     summary: Update user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               role:
 *                 type: string
 *                 enum: [admin, dentist, assistant, receptionist]
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 */
router.put(
  '/:userId',
  authMiddleware.authenticateJWT,
  authMiddleware.requireRole([Role.ADMIN]),
  validate(updateUserValidation),
  userController.updateUser
);

/**
 * @swagger
 * /api/auth/users/{userId}:
 *   delete:
 *     summary: Delete user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     responses:
 *       200:
 *         description: User deleted successfully
 */
router.delete(
  '/:userId',
  authMiddleware.authenticateJWT,
  authMiddleware.requireRole([Role.ADMIN]),
  userController.deleteUser
);

export default router; 