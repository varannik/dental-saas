/**
 * Authentication Service - Main Entry Point
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { rateLimit } = require('express-rate-limit');
const logger = require('./utils/logger');
const { errorHandler } = require('./middlewares/errorHandler');

// Initialize database connection
const db = require('./models/db');

// Redis client for token blacklisting
const redisClient = require('./utils/redis');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const tenantRoutes = require('./routes/tenants');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Apply security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Setup request logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Apply rate limiting
const apiLimiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes by default
  max: process.env.RATE_LIMIT_MAX || 100, // 100 requests per windowMs
  standardHeaders: true,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/auth', apiLimiter);

// Health check route
app.get('/api/auth/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    service: 'auth-service',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/users', userRoutes);
app.use('/api/auth/tenants', tenantRoutes);

// API documentation setup - only in development
if (process.env.NODE_ENV === 'development') {
  const swaggerJsDoc = require('swagger-jsdoc');
  const swaggerUi = require('swagger-ui-express');
  
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Dental SaaS Auth API',
        version: '1.0.0',
        description: 'Authentication and Authorization API for Dental SaaS Platform'
      },
      servers: [
        {
          url: `http://localhost:${PORT}`
        }
      ]
    },
    apis: ['./src/routes/*.js']
  };
  
  const swaggerDocs = swaggerJsDoc(swaggerOptions);
  app.use('/api/auth/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
}

// Global error handler
app.use(errorHandler);

// Start the server
const startServer = async () => {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    logger.info('Database connected successfully');

    // Test Redis connection
    await redisClient.connect();
    logger.info('Redis connected successfully');

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Authentication service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
  process.exit(1);
});

startServer(); 