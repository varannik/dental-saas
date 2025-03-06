import { Express } from 'express';
import winston from 'winston';
import morgan from 'morgan';

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Setup request logging middleware
export const setupLogging = (app: Express): void => {
  // Use Morgan for HTTP request logging
  app.use(
    morgan('combined', {
      stream: {
        write: (message: string) => {
          logger.info(message.trim());
        }
      }
    })
  );
};

// Export logger for use throughout the application
export default logger; 