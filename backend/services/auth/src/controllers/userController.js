/**
 * User Controller
 */
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const tokenService = require('../services/tokenService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { NotFoundError, ConflictError, ForbiddenError } = require('../middlewares/errorHandler');

// Create a new user
const createUser = async (req, res, next) => {
  try {
    const { email, password, role, firstName, lastName } = req.body;
    const tenantId = req.user.tenantId;
    
    // Check if user already exists
    const existingUser = await db.query(
      'SELECT * FROM public.users WHERE email = $1 AND tenant_id = $2',
      [email, tenantId]
    );
    
    if (existingUser.rows.length > 0) {
      throw new ConflictError('User already exists');
    }
    
    // Get tenant info for emails
    const tenantResult = await db.query(
      'SELECT name, domain FROM public.tenants WHERE id = $1',
      [tenantId]
    );
    
    if (tenantResult.rows.length === 0) {
      throw new NotFoundError('Tenant not found');
    }
    
    const tenant = tenantResult.rows[0];
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = uuidv4();
    await db.query(
      `INSERT INTO public.users 
      (id, tenant_id, email, password_hash, role, first_name, last_name, is_active) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, tenantId, email, hashedPassword, role, firstName, lastName, true]
    );
    
    // Generate email verification token
    const verificationToken = await tokenService.generateEmailVerificationToken(userId);
    
    // Send verification email
    await emailService.sendVerificationEmail(email, verificationToken, tenant.domain);
    
    // Send welcome email
    await emailService.sendWelcomeEmail(email, firstName, tenant.name, tenant.domain);
    
    res.status(201).json({
      message: 'User created successfully',
      userId
    });
  } catch (err) {
    next(err);
  }
};

// Get user by ID
const getUserById = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const tenantId = req.user.tenantId;
    
    // Get user info
    const userResult = await db.query(
      `SELECT id, email, role, first_name, last_name, email_verified, 
      is_active, created_at, updated_at 
      FROM public.users 
      WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    
    const user = userResult.rows[0];
    
    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
  } catch (err) {
    next(err);
  }
};

// Get all users for tenant
const getAllUsers = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { page = 1, limit = 10, role, search } = req.query;
    
    // Build query
    let query = `
      SELECT id, email, role, first_name, last_name, email_verified, 
      is_active, created_at, updated_at 
      FROM public.users 
      WHERE tenant_id = $1
    `;
    
    const queryParams = [tenantId];
    let paramIndex = 2;
    
    // Add role filter
    if (role) {
      query += ` AND role = $${paramIndex}`;
      queryParams.push(role);
      paramIndex++;
    }
    
    // Add search filter
    if (search) {
      query += ` AND (
        email ILIKE $${paramIndex} OR 
        first_name ILIKE $${paramIndex} OR 
        last_name ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    // Add pagination
    const offset = (page - 1) * limit;
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    // Get users
    const userResult = await db.query(query, queryParams);
    
    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM public.users 
      WHERE tenant_id = $1
    `;
    
    let countParams = [tenantId];
    paramIndex = 2;
    
    // Add role filter to count
    if (role) {
      countQuery += ` AND role = $${paramIndex}`;
      countParams.push(role);
      paramIndex++;
    }
    
    // Add search filter to count
    if (search) {
      countQuery += ` AND (
        email ILIKE $${paramIndex} OR 
        first_name ILIKE $${paramIndex} OR 
        last_name ILIKE $${paramIndex}
      )`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total, 10);
    
    // Format response
    const users = userResult.rows.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      emailVerified: user.email_verified,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }));
    
    res.status(200).json({
      users,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

// Update user
const updateUser = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const tenantId = req.user.tenantId;
    const { role, firstName, lastName, isActive } = req.body;
    
    // Check if user exists
    const userCheck = await db.query(
      'SELECT * FROM public.users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    
    // Prevent non-admins from changing roles or active status
    if (req.user.role !== 'admin' && (role || isActive !== undefined)) {
      throw new ForbiddenError('Insufficient permissions to update role or active status');
    }
    
    // Update user
    await db.query(
      `UPDATE public.users 
      SET role = COALESCE($1, role), 
          first_name = COALESCE($2, first_name), 
          last_name = COALESCE($3, last_name),
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
      WHERE id = $5 AND tenant_id = $6`,
      [role, firstName, lastName, isActive, userId, tenantId]
    );
    
    res.status(200).json({ message: 'User updated successfully' });
  } catch (err) {
    next(err);
  }
};

// Delete user (soft delete)
const deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const tenantId = req.user.tenantId;
    
    // Check if user exists
    const userCheck = await db.query(
      'SELECT * FROM public.users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    
    // Prevent deleting yourself
    if (userId === req.user.userId) {
      throw new ForbiddenError('Cannot delete your own account');
    }
    
    // Soft delete user
    await db.query(
      'UPDATE public.users SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    // Revoke all refresh tokens
    await tokenService.revokeAllUserTokens(userId);
    
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// Reset user password (admin only)
const resetUserPassword = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const tenantId = req.user.tenantId;
    const { newPassword } = req.body;
    
    // Check if user exists
    const userCheck = await db.query(
      'SELECT email FROM public.users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    
    // Get tenant domain for email
    const tenantResult = await db.query(
      'SELECT name, domain FROM public.tenants WHERE id = $1',
      [tenantId]
    );
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await db.query(
      'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );
    
    // Revoke all refresh tokens
    await tokenService.revokeAllUserTokens(userId);
    
    // Send password reset notification
    if (tenantResult.rows.length > 0) {
      const tenant = tenantResult.rows[0];
      const email = userCheck.rows[0].email;
      
      // Send email notification
      // This would be a different email template than the one used for user-initiated resets
      await emailService.sendPasswordResetEmail(email, null, tenant.domain);
    }
    
    res.status(200).json({ message: 'User password reset successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createUser,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  resetUserPassword
}; 