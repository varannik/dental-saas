/**
 * Redis client for token blacklisting and rate limiting
 */
const { createClient } = require('redis');
const logger = require('./logger');

// Create Redis client
const redisClient = createClient({
  url: `redis://${process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ''}${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`
});

// Handle Redis errors
redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

// Handle Redis connection
redisClient.on('connect', () => {
  logger.info('Redis connected');
});

// Handle Redis reconnection
redisClient.on('reconnecting', () => {
  logger.info('Redis reconnecting');
});

// Add token to blacklist
const blacklistToken = async (token, expiryTime) => {
  try {
    await redisClient.set(`bl_${token}`, 'true', {
      EX: expiryTime
    });
    return true;
  } catch (err) {
    logger.error('Error blacklisting token:', err);
    return false;
  }
};

// Check if token is blacklisted
const isTokenBlacklisted = async (token) => {
  try {
    const result = await redisClient.get(`bl_${token}`);
    return result === 'true';
  } catch (err) {
    logger.error('Error checking blacklisted token:', err);
    return false;
  }
};

module.exports = {
  connect: () => redisClient.connect(),
  disconnect: () => redisClient.disconnect(),
  blacklistToken,
  isTokenBlacklisted,
  client: redisClient
}; 