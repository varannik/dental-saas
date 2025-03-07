/**
 * Authentication middleware
 */
const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('./errorHandler');
const redisClient = require('../utils/redis');
const logger = require('../utils/logger');

// Middleware to authenticate JWT tokens
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('Authorization header missing');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Bearer token missing');
    }

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    // Verify token
    jwt.verify(
      token, 
      process.env.JWT_SECRET, 
      { algorithms: ['HS256'] },
      (err, decoded) => {
        if (err) {
          if (err.name === 'TokenExpiredError') {
            throw new UnauthorizedError('Token has expired');
          } else {
            throw new UnauthorizedError('Invalid token');
          }
        }
        
        req.user = decoded;
        next();
      }
    );
  } catch (error) {
    next(error);
  }
};

// Middleware to check user roles
const requireRole = (roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const userRole = req.user.role;
      
      if (!roles.includes(userRole)) {
        throw new ForbiddenError('Insufficient permissions');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Middleware to check if user belongs to tenant
const requireSameTenant = (req, res, next) => {
  try {
    const userTenantId = req.user.tenantId;
    const requestedTenantId = req.params.tenantId || req.body.tenantId;
    
    if (requestedTenantId && userTenantId !== requestedTenantId) {
      throw new ForbiddenError('Access denied to requested tenant');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to check if user is accessing their own data
const requireSameUser = (req, res, next) => {
  try {
    const userId = req.user.userId;
    const requestedUserId = req.params.userId || req.body.userId;
    
    if (requestedUserId && userId !== requestedUserId && req.user.role !== 'admin') {
      throw new ForbiddenError('Access denied to requested user data');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticateJWT,
  requireRole,
  requireSameTenant,
  requireSameUser
}; 