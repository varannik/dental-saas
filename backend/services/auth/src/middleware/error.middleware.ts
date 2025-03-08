import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/error.types';
import { logger } from '../utils/logger';

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Default error values
  let statusCode = 500;
  let errorCode = ErrorCode.INTERNAL_ERROR;
  let message = 'Internal server error';
  let isOperational = false;

  // If it's our custom AppError, use its properties
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    isOperational = err.isOperational;
  } else if (err.name === 'ValidationError') {
    // Handle validation errors (e.g., from express-validator)
    statusCode = 400;
    errorCode = ErrorCode.BAD_REQUEST;
    message = err.message;
    isOperational = true;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    // Handle JWT errors
    statusCode = 401;
    errorCode = ErrorCode.UNAUTHORIZED;
    message = 'Invalid or expired token';
    isOperational = true;
  }

  // Log the error
  if (isOperational) {
    logger.warn(`Operational error: ${message}`, {
      statusCode,
      errorCode,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
  } else {
    logger.error(`Unexpected error: ${message}`, {
      error: err,
      stack: err.stack,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
  }

  // Send response
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message
    }
  });
}; 