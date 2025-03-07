/**
 * CSRF Protection Middleware
 */
const csrf = require('csurf');
const { ValidationError } = require('./errorHandler');

// Configure CSRF protection
const csrfProtection = csrf({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict'
  }
});

// Error handler for CSRF errors
const handleCSRFError = (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    throw new ValidationError('Invalid CSRF token');
  } else {
    next(err);
  }
};

// Middleware to apply CSRF protection
const applyCSRFProtection = (req, res, next) => {
  // Skip CSRF for non-mutating methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip CSRF for API endpoints that use JWT authentication
  if (req.path.startsWith('/api/') && req.headers.authorization) {
    return next();
  }
  
  // Apply CSRF protection
  csrfProtection(req, res, (err) => {
    if (err) {
      return handleCSRFError(err, req, res, next);
    }
    next();
  });
};

// Generate CSRF token
const generateCSRFToken = (req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
};

module.exports = {
  applyCSRFProtection,
  generateCSRFToken
}; 