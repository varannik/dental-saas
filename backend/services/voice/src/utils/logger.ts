import winston from 'winston';

/**
 * Creates a logger instance with the specified module name
 * @param moduleName The name of the module using the logger
 * @returns A configured winston logger instance
 */
export function createLogger(moduleName: string) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    ),
    defaultMeta: { service: 'voice-service', module: moduleName },
    transports: [
      // Write all logs to console
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
            return `${timestamp} [${level}] [${module}]: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
            }`;
          })
        ),
      }),
      // In production, you would add additional transports here
      // such as writing to a file or sending to a log aggregation service
    ],
  });
}

// Default logger for general use
export const logger = createLogger('app'); 