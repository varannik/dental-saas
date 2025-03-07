/**
 * Input validation middleware
 */
const { body, param, validationResult } = require('express-validator');
const { ValidationError } = require('./errorHandler');

// Middleware to validate request
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg
    }));
    
    throw new ValidationError(JSON.stringify(errorMessages));
  }
  next();
};

// Validation rules for user registration
const registerValidation = [
  body('name')
    .notEmpty().withMessage('Tenant name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Tenant name must be between 2 and 100 characters'),
  
  body('domain')
    .notEmpty().withMessage('Domain is required')
    .isLength({ min: 3, max: 100 }).withMessage('Domain must be between 3 and 100 characters')
    .matches(/^[a-z0-9-]+$/).withMessage('Domain can only contain lowercase letters, numbers, and hyphens'),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('plan')
    .notEmpty().withMessage('Subscription plan is required')
    .isIn(['free', 'basic', 'premium', 'enterprise']).withMessage('Invalid subscription plan'),
  
  validate
];

// Validation rules for login
const loginValidation = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
  
  body('domain')
    .notEmpty().withMessage('Domain is required'),
  
  validate
];

// Validation rules for creating a user
const createUserValidation = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['admin', 'dentist', 'assistant', 'receptionist']).withMessage('Invalid role'),
  
  body('firstName')
    .optional()
    .isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  
  body('lastName')
    .optional()
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  
  validate
];

// Validation rules for changing password
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  validate
];

// Validation rules for password reset request
const passwordResetRequestValidation = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('domain')
    .notEmpty().withMessage('Domain is required'),
  
  validate
];

// Validation rules for password reset
const passwordResetValidation = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),
  
  body('password')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  validate
];

// Validation rules for refresh token
const refreshTokenValidation = [
  body('refreshToken')
    .notEmpty().withMessage('Refresh token is required'),
  
  validate
];

module.exports = {
  registerValidation,
  loginValidation,
  createUserValidation,
  changePasswordValidation,
  passwordResetRequestValidation,
  passwordResetValidation,
  refreshTokenValidation
}; 