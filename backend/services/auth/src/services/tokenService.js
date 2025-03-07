/**
 * Token Service
 */
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const redisClient = require('../utils/redis');
const logger = require('../utils/logger');

// Generate access token
const generateAccessToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
      algorithm: 'HS256'
    }
  );
};

// Generate refresh token
const generateRefreshToken = async (userId) => {
  try {
    const tokenId = uuidv4();
    const expiresIn = process.env.JWT_REFRESH_EXPIRY || '7d';
    
    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + parseInt(expiryDate, 10) || 7);
    
    // Create refresh token
    const refreshToken = jwt.sign(
      { userId, tokenId },
      process.env.JWT_REFRESH_SECRET,
      { 
        expiresIn,
        algorithm: 'HS256'
      }
    );
    
    // Store refresh token in database
    await db.query(
      `INSERT INTO public.refresh_tokens 
      (id, user_id, token, expires_at) 
      VALUES ($1, $2, $3, $4)`,
      [tokenId, userId, refreshToken, expiryDate]
    );
    
    return refreshToken;
  } catch (err) {
    logger.error('Error generating refresh token:', err);
    throw err;
  }
};

// Verify refresh token
const verifyRefreshToken = async (refreshToken) => {
  try {
    // Verify token signature
    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET,
      { algorithms: ['HS256'] }
    );
    
    // Check if token exists in database and is not revoked
    const result = await db.query(
      `SELECT * FROM public.refresh_tokens 
      WHERE id = $1 AND user_id = $2 AND revoked = false`,
      [decoded.tokenId, decoded.userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid refresh token');
    }
    
    const tokenRecord = result.rows[0];
    
    // Check if token is expired
    if (new Date() > new Date(tokenRecord.expires_at)) {
      // Revoke expired token
      await db.query(
        `UPDATE public.refresh_tokens 
        SET revoked = true, revoked_at = NOW() 
        WHERE id = $1`,
        [decoded.tokenId]
      );
      throw new Error('Refresh token expired');
    }
    
    return decoded;
  } catch (err) {
    logger.error('Error verifying refresh token:', err);
    throw err;
  }
};

// Revoke refresh token
const revokeRefreshToken = async (tokenId) => {
  try {
    await db.query(
      `UPDATE public.refresh_tokens 
      SET revoked = true, revoked_at = NOW() 
      WHERE id = $1`,
      [tokenId]
    );
    return true;
  } catch (err) {
    logger.error('Error revoking refresh token:', err);
    return false;
  }
};

// Revoke all refresh tokens for a user
const revokeAllUserTokens = async (userId) => {
  try {
    await db.query(
      `UPDATE public.refresh_tokens 
      SET revoked = true, revoked_at = NOW() 
      WHERE user_id = $1 AND revoked = false`,
      [userId]
    );
    return true;
  } catch (err) {
    logger.error('Error revoking all user tokens:', err);
    return false;
  }
};

// Blacklist access token
const blacklistAccessToken = async (token) => {
  try {
    // Decode token to get expiry time
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return false;
    }
    
    // Calculate remaining time in seconds
    const expiryTime = decoded.exp - Math.floor(Date.now() / 1000);
    if (expiryTime <= 0) {
      return true; // Token already expired
    }
    
    // Add to Redis blacklist
    await redisClient.blacklistToken(token, expiryTime);
    return true;
  } catch (err) {
    logger.error('Error blacklisting access token:', err);
    return false;
  }
};

// Generate email verification token
const generateEmailVerificationToken = async (userId) => {
  try {
    const tokenId = uuidv4();
    
    // Calculate expiry date (24 hours)
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 24);
    
    // Create token
    const token = uuidv4();
    
    // Store token in database
    await db.query(
      `INSERT INTO public.email_verification_tokens 
      (id, user_id, token, expires_at) 
      VALUES ($1, $2, $3, $4)`,
      [tokenId, userId, token, expiryDate]
    );
    
    return token;
  } catch (err) {
    logger.error('Error generating email verification token:', err);
    throw err;
  }
};

// Verify email verification token
const verifyEmailToken = async (token) => {
  try {
    // Check if token exists and is not used
    const result = await db.query(
      `SELECT * FROM public.email_verification_tokens 
      WHERE token = $1 AND used = false`,
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid verification token');
    }
    
    const tokenRecord = result.rows[0];
    
    // Check if token is expired
    if (new Date() > new Date(tokenRecord.expires_at)) {
      throw new Error('Verification token expired');
    }
    
    // Mark token as used
    await db.query(
      `UPDATE public.email_verification_tokens 
      SET used = true 
      WHERE id = $1`,
      [tokenRecord.id]
    );
    
    // Mark user as verified
    await db.query(
      `UPDATE public.users 
      SET email_verified = true 
      WHERE id = $1`,
      [tokenRecord.user_id]
    );
    
    return tokenRecord.user_id;
  } catch (err) {
    logger.error('Error verifying email token:', err);
    throw err;
  }
};

// Generate password reset token
const generatePasswordResetToken = async (userId) => {
  try {
    const tokenId = uuidv4();
    
    // Calculate expiry date (1 hour)
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 1);
    
    // Create token
    const token = uuidv4();
    
    // Store token in database
    await db.query(
      `INSERT INTO public.password_reset_tokens 
      (id, user_id, token, expires_at) 
      VALUES ($1, $2, $3, $4)`,
      [tokenId, userId, token, expiryDate]
    );
    
    return token;
  } catch (err) {
    logger.error('Error generating password reset token:', err);
    throw err;
  }
};

// Verify password reset token
const verifyPasswordResetToken = async (token) => {
  try {
    // Check if token exists and is not used
    const result = await db.query(
      `SELECT * FROM public.password_reset_tokens 
      WHERE token = $1 AND used = false`,
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid reset token');
    }
    
    const tokenRecord = result.rows[0];
    
    // Check if token is expired
    if (new Date() > new Date(tokenRecord.expires_at)) {
      throw new Error('Reset token expired');
    }
    
    return tokenRecord;
  } catch (err) {
    logger.error('Error verifying password reset token:', err);
    throw err;
  }
};

// Mark password reset token as used
const markResetTokenAsUsed = async (tokenId) => {
  try {
    await db.query(
      `UPDATE public.password_reset_tokens 
      SET used = true 
      WHERE id = $1`,
      [tokenId]
    );
    return true;
  } catch (err) {
    logger.error('Error marking reset token as used:', err);
    return false;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  blacklistAccessToken,
  generateEmailVerificationToken,
  verifyEmailToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  markResetTokenAsUsed
}; 