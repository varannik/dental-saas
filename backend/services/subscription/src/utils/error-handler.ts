import { Request, Response, NextFunction } from 'express';
import logger from './logging';

// Custom error class for API errors
export class ApiError extends Error {
  statusCode: number;
  
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handling middleware
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Determine status code (default to 500 if not an ApiError)
  const statusCode = 'statusCode' in err ? err.statusCode : 500;
  
  // Send error response
  res.status(statusCode).json({
    status: 'error',
    message: err.message,
    // Only include stack trace in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}; 