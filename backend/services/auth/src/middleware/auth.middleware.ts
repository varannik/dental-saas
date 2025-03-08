import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RedisService } from '../services/redis.service';
import { UnauthorizedError, ForbiddenError } from '../types/error.types';
import { AccessTokenPayload } from '../types/auth.types';
import { Role } from '../types/user.types';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export class AuthMiddleware {
  constructor(private redisService: RedisService) {}

  authenticateJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      const isBlacklisted = await this.redisService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedError('Token has been revoked');
      }

      // Verify token
      try {
        const decoded = jwt.verify(
          token, 
          process.env.JWT_SECRET!,
          { algorithms: ['HS256'] }
        ) as AccessTokenPayload;
        
        req.user = decoded;
        next();
      } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
          throw new UnauthorizedError('Token has expired');
        } else {
          throw new UnauthorizedError('Invalid token');
        }
      }
    } catch (error) {
      next(error);
    }
  };

  requireRole = (roles: Role[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
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

  requireSameTenant = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { user } = req;
      const tenantId = req.params.tenantId || req.body.tenantId;
      
      if (!user) {
        throw new UnauthorizedError('Authentication required');
      }
      
      if (user.tenantId !== tenantId && user.role !== Role.ADMIN) {
        throw new ForbiddenError('Access denied to this tenant');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };

  requireSameUser = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { user } = req;
      const userId = req.params.userId || req.body.userId;
      
      if (!user) {
        throw new UnauthorizedError('Authentication required');
      }
      
      if (user.userId !== userId && user.role !== Role.ADMIN) {
        throw new ForbiddenError('Access denied to this user');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
} 