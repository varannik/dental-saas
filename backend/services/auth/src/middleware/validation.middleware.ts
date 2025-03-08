import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { BadRequestError } from '../types/error.types';

/**
 * Middleware to validate request data using express-validator
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    
    if (errors.isEmpty()) {
      return next();
    }

    // Format validation errors
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg
    }));

    // Throw a BadRequestError with the validation errors
    const errorMessage = `Validation failed: ${formattedErrors.map(e => `${e.field} - ${e.message}`).join(', ')}`;
    next(new BadRequestError(errorMessage));
  };
};

// Common validation schemas
import { body, param, query } from 'express-validator';

export const loginValidation = [
  body('email').isEmail().withMessage('Must be a valid email address'),
  body('password').isString().notEmpty().withMessage('Password is required'),
  body('domain').isString().notEmpty().withMessage('Domain is required')
];

export const refreshTokenValidation = [
  body('refreshToken').isString().notEmpty().withMessage('Refresh token is required')
];

export const createUserValidation = [
  body('email').isEmail().withMessage('Must be a valid email address'),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must include uppercase, lowercase, number and special character'),
  body('role').isIn(['admin', 'dentist', 'assistant', 'receptionist']).withMessage('Invalid role'),
  body('firstName').optional().isString().withMessage('First name must be a string'),
  body('lastName').optional().isString().withMessage('Last name must be a string')
];

export const updateUserValidation = [
  param('userId').isUUID().withMessage('Invalid user ID'),
  body('role').optional().isIn(['admin', 'dentist', 'assistant', 'receptionist']).withMessage('Invalid role'),
  body('firstName').optional().isString().withMessage('First name must be a string'),
  body('lastName').optional().isString().withMessage('Last name must be a string'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

export const passwordResetRequestValidation = [
  body('email').isEmail().withMessage('Must be a valid email address'),
  body('domain').isString().notEmpty().withMessage('Domain is required')
];

export const passwordResetValidation = [
  body('token').isString().notEmpty().withMessage('Token is required'),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must include uppercase, lowercase, number and special character')
];

export const changePasswordValidation = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must include uppercase, lowercase, number and special character')
]; 