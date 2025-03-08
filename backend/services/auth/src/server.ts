import dotenv from 'dotenv';
import app from './app';
import db from './models/db';
import { RedisService } from './services/redis.service';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;
const redisService = new RedisService();

// Start the server
const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    logger.info('Database connected successfully');

    // Test Redis connection
    await redisService.connect();
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await redisService.disconnect();
    logger.info('Redis disconnected');
    
    // Close database pool
    await db.pool.end();
    logger.info('Database pool closed');
    
    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
});

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

export { startServer }; 