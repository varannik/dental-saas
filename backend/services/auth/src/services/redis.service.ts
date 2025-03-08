import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis Client Connected');
      this.isConnected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Add a token to the blacklist
   * @param token The token to blacklist
   * @param expiryTime Time in seconds until the token expires
   */
  async blacklistToken(token: string, expiryTime: number): Promise<void> {
    try {
      // Use the token itself as the key to avoid storing it twice
      // The value doesn't matter, we just need the key to exist
      await this.client.set(`blacklist:${token}`, '1', {
        EX: expiryTime
      });
    } catch (err) {
      logger.error('Error blacklisting token:', err);
      throw err;
    }
  }

  /**
   * Check if a token is blacklisted
   * @param token The token to check
   * @returns True if the token is blacklisted, false otherwise
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const result = await this.client.get(`blacklist:${token}`);
      return result !== null;
    } catch (err) {
      logger.error('Error checking blacklisted token:', err);
      // If there's an error checking, assume not blacklisted
      // This prevents users from being locked out if Redis is down
      return false;
    }
  }
} 