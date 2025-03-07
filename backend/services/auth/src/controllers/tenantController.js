/**
 * Tenant Controller
 */
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const tokenService = require('../services/tokenService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { NotFoundError, ConflictError } = require('../middlewares/errorHandler');

// Register new tenant
const registerTenant = async (req, res, next) => {
  try {
    const { name, domain, email, password, plan } = req.body;
    
    // Start transaction
    const result = await db.transaction(async (client) => {
      // Check if domain already exists
      const domainCheck = await client.query(
        'SELECT * FROM public.tenants WHERE domain = $1',
        [domain]
      );
      
      if (domainCheck.rows.length > 0) {
        throw new ConflictError('Domain already registered');
      }
      
      // Insert new tenant
      const tenantId = uuidv4();
      await client.query(
        `INSERT INTO public.tenants 
        (id, name, domain, subscription_plan, subscription_status) 
        VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, name, domain, plan, 'active']
      );
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Insert admin user for tenant
      const userId = uuidv4();
      await client.query(
        `INSERT INTO public.users 
        (id, tenant_id, email, password_hash, role, is_active) 
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, tenantId, email, hashedPassword, 'admin', true]
      );
      
      // Generate email verification token
      const verificationToken = await tokenService.generateEmailVerificationToken(userId);
      
      return {
        tenantId,
        userId,
        verificationToken
      };
    });
    
    // Generate access token
    const accessToken = tokenService.generateAccessToken({
      userId: result.userId,
      email,
      tenantId: result.tenantId,
      role: 'admin'
    });
    
    // Generate refresh token
    const refreshToken = await tokenService.generateRefreshToken(result.userId);
    
    // Send verification email
    await emailService.sendVerificationEmail(email, result.verificationToken, domain);
    
    // Send welcome email
    await emailService.sendWelcomeEmail(email, null, name, domain);
    
    res.status(201).json({
      message: 'Tenant registered successfully',
      tenantId: result.tenantId,
      userId: result.userId,
      accessToken,
      refreshToken
    });
  } catch (err) {
    next(err);
  }
};

// Get tenant details
const getTenantDetails = async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId || req.user.tenantId;
    
    // Get tenant info
    const tenantResult = await db.query(
      'SELECT id, name, domain, subscription_plan, subscription_status, created_at FROM public.tenants WHERE id = $1',
      [tenantId]
    );
    
    if (tenantResult.rows.length === 0) {
      throw new NotFoundError('Tenant not found');
    }
    
    const tenant = tenantResult.rows[0];
    
    // Get user count
    const userCountResult = await db.query(
      'SELECT COUNT(*) as user_count FROM public.users WHERE tenant_id = $1',
      [tenantId]
    );
    
    res.status(200).json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        subscriptionPlan: tenant.subscription_plan,
        subscriptionStatus: tenant.subscription_status,
        createdAt: tenant.created_at,
        userCount: parseInt(userCountResult.rows[0].user_count, 10)
      }
    });
  } catch (err) {
    next(err);
  }
};

// Update tenant
const updateTenant = async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId || req.user.tenantId;
    const { name, subscriptionPlan, subscriptionStatus } = req.body;
    
    // Check if tenant exists
    const tenantCheck = await db.query(
      'SELECT * FROM public.tenants WHERE id = $1',
      [tenantId]
    );
    
    if (tenantCheck.rows.length === 0) {
      throw new NotFoundError('Tenant not found');
    }
    
    // Update tenant
    await db.query(
      `UPDATE public.tenants 
      SET name = COALESCE($1, name), 
          subscription_plan = COALESCE($2, subscription_plan), 
          subscription_status = COALESCE($3, subscription_status),
          updated_at = NOW()
      WHERE id = $4`,
      [name, subscriptionPlan, subscriptionStatus, tenantId]
    );
    
    res.status(200).json({ message: 'Tenant updated successfully' });
  } catch (err) {
    next(err);
  }
};

// Deactivate tenant
const deactivateTenant = async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId;
    
    // Check if tenant exists
    const tenantCheck = await db.query(
      'SELECT * FROM public.tenants WHERE id = $1',
      [tenantId]
    );
    
    if (tenantCheck.rows.length === 0) {
      throw new NotFoundError('Tenant not found');
    }
    
    // Deactivate tenant
    await db.transaction(async (client) => {
      // Deactivate tenant
      await client.query(
        'UPDATE public.tenants SET is_active = false, updated_at = NOW() WHERE id = $1',
        [tenantId]
      );
      
      // Deactivate all users
      await client.query(
        'UPDATE public.users SET is_active = false, updated_at = NOW() WHERE tenant_id = $1',
        [tenantId]
      );
      
      // Revoke all refresh tokens
      const userResult = await client.query(
        'SELECT id FROM public.users WHERE tenant_id = $1',
        [tenantId]
      );
      
      for (const user of userResult.rows) {
        await tokenService.revokeAllUserTokens(user.id);
      }
    });
    
    res.status(200).json({ message: 'Tenant deactivated successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerTenant,
  getTenantDetails,
  updateTenant,
  deactivateTenant
}; 