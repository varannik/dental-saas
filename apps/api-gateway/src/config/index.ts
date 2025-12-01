import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
    users: process.env.USERS_SERVICE_URL || 'http://localhost:4002',
    billing: process.env.BILLING_SERVICE_URL || 'http://localhost:4003',
    notifications: process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:4004',
  },
  
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },
};

