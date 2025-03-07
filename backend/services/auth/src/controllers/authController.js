/**
 * Authentication Controller
 */
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const tokenService = require('../services/tokenService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { NotFoundError, UnauthorizedError, ValidationError } = require('../middlewares/errorHandler');

// Login user
const login = async (req, res, next) => {
  try {
    const { email, password, domain } = req.body;
    
    // Find tenant by domain
    const tenantResult = await db.query(
      'SELECT * FROM public.tenants WHERE domain = $1 AND is_active = true',
      [domain]
    );
    
    if (tenantResult.rows.length === 0) {
      throw new NotFoundError('Tenant not found or inactive');
    }
    
    const tenant = tenantResult.rows[0];
    
    // Find user by email and tenant
    const userResult = await db.query(
      'SELECT * FROM public.users WHERE email = $1 AND tenant_id = $2 AND is_active = true',
      [email, tenant.id]
    );
    
    if (userResult.rows.length === 0) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    const user = userResult.rows[0];
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    // Generate tokens
    const accessToken = tokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role
    });
    
    const refreshToken = await tokenService.generateRefreshToken(user.id);
    
    // Return tokens and user info
    res.status(200).json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantDomain: tenant.domain
      }
    });
  } catch (err) {
    next(err);
  }
};

// Refresh access token
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    
    // Verify refresh token
    const decoded = await tokenService.verifyRefreshToken(token);
    
    // Get user info
    const userResult = await db.query(
      'SELECT * FROM public.users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new UnauthorizedError('User not found or inactive');
    }
    
    const user = userResult.rows[0];
    
    // Get tenant info
    const tenantResult = await db.query(
      'SELECT * FROM public.tenants WHERE id = $1 AND is_active = true',
      [user.tenant_id]
    );
    
    if (tenantResult.rows.length === 0) {
      throw new UnauthorizedError('Tenant not found or inactive');
    }
    
    const tenant = tenantResult.rows[0];
    
    // Generate new access token
    const accessToken = tokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role
    });
    
    // Return new access token
    res.status(200).json({
      accessToken
    });
  } catch (err) {
    next(err);
  }
};

// Logout user
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const accessToken = authHeader.split(' ')[1];
      if (accessToken) {
        // Blacklist access token
        await tokenService.blacklistAccessToken(accessToken);
      }
    }
    
    if (refreshToken) {
      try {
        // Verify and revoke refresh token
        const decoded = await tokenService.verifyRefreshToken(refreshToken);
        await tokenService.revokeRefreshToken(decoded.tokenId);
      } catch (err) {
        // Ignore errors with refresh token
        logger.warn('Error revoking refresh token during logout:', err);
      }
    }
    
    res.status(200).json({ message: 'Logout successful' });
  } catch (err) {
    next(err);
  }
};

// Request password reset
const requestPasswordReset = async (req, res, next) => {
  try {
    const { email, domain } = req.body;
    
    // Find tenant by domain
    const tenantResult = await db.query(
      'SELECT * FROM public.tenants WHERE domain = $1 AND is_active = true',
      [domain]
    );
    
    if (tenantResult.rows.length === 0) {
      // Don't reveal that tenant doesn't exist
      return res.status(200).json({ message: 'If your email is registered, you will receive a password reset link' });
    }
    
    const tenant = tenantResult.rows[0];
    
    // Find user by email and tenant
    const userResult = await db.query(
      'SELECT * FROM public.users WHERE email = $1 AND tenant_id = $2 AND is_active = true',
      [email, tenant.id]
    );
    
    if (userResult.rows.length === 0) {
      // Don't reveal that user doesn't exist
      return res.status(200).json({ message: 'If your email is registered, you will receive a password reset link' });
    }
    
    const user = userResult.rows[0];
    
    // Generate password reset token
    const resetToken = await tokenService.generatePasswordResetToken(user.id);
    
    // Send password reset email
    await emailService.sendPasswordResetEmail(email, resetToken, tenant.domain);
    
    res.status(200).json({ message: 'If your email is registered, you will receive a password reset link' });
  } catch (err) {
    next(err);
  }
};

// Reset password
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    
    // Verify reset token
    const tokenRecord = await tokenService.verifyPasswordResetToken(token);
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update user password
    await db.query(
      'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, tokenRecord.user_id]
    );
    
    // Mark token as used
    await tokenService.markResetTokenAsUsed(tokenRecord.id);
    
    // Revoke all refresh tokens for the user
    await tokenService.revokeAllUserTokens(tokenRecord.user_id);
    
    res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
};

// Change password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;
    
    // Get user's current password
    const userResult = await db.query(
      'SELECT password_hash FROM public.users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      throw new ValidationError('Current password is incorrect');
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await db.query(
      'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );
    
    // Revoke all refresh tokens except current one
    await tokenService.revokeAllUserTokens(userId);
    
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
};

// Verify email
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    
    // Verify email token
    const userId = await tokenService.verifyEmailToken(token);
    
    res.status(200).json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
};

// Get current user info
const getCurrentUser = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Get user info
    const userResult = await db.query(
      'SELECT id, tenant_id, email, role, first_name, last_name, email_verified FROM public.users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    
    const user = userResult.rows[0];
    
    // Get tenant info
    const tenantResult = await db.query(
      'SELECT id, name, domain, subscription_plan, subscription_status FROM public.tenants WHERE id = $1',
      [user.tenant_id]
    );
    
    if (tenantResult.rows.length === 0) {
      throw new NotFoundError('Tenant not found');
    }
    
    const tenant = tenantResult.rows[0];
    
    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        subscriptionPlan: tenant.subscription_plan,
        subscriptionStatus: tenant.subscription_status
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  refreshToken,
  logout,
  requestPasswordReset,
  resetPassword,
  changePassword,
  verifyEmail,
  getCurrentUser
};