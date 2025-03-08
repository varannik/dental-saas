import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import passport from 'passport';
import 'express-async-errors';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import tenantRoutes from './routes/tenant.routes';
import socialRoutes from './routes/social.routes';

// Initialize Express app
const app: Express = express();

// Apply security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Setup request logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Apply rate limiting
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes by default
  limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 100 requests per window by default
  standardHeaders: true,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/auth', apiLimiter);

// Initialize passport for social auth
import { initializePassport } from './config/passport.config';
const passportInstance = initializePassport();
app.use(passport.initialize());

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
app.use('/api/auth/social', socialRoutes);

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
          url: `http://localhost:${process.env.PORT || 3001}`
        }
      ]
    },
    apis: ['./src/routes/*.ts']
  };
  
  const swaggerDocs = swaggerJsDoc(swaggerOptions);
  app.use('/api/auth/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
}

// Global error handler
app.use(errorHandler);

export default app; 