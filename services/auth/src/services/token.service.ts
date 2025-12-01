import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { redis } from '../utils/redis';
import { AppError } from '../utils/errors';

interface User {
  id: string;
  email: string;
  role?: string;
}

interface TokenPayload {
  id: string;
  email: string;
  role?: string;
}

export class TokenService {
  async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: TokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    const refreshToken = nanoid(64);

    // Store refresh token in Redis
    await redis.set(
      `refresh_token:${refreshToken}`,
      JSON.stringify({ userId: user.id }),
      'EX',
      7 * 24 * 60 * 60 // 7 days
    );

    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    const tokenData = await redis.get(`refresh_token:${refreshToken}`);
    if (!tokenData) {
      throw new AppError('Invalid refresh token', 401);
    }

    const { userId } = JSON.parse(tokenData);

    // Generate new access token
    const accessToken = jwt.sign({ id: userId }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    return { accessToken };
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await redis.del(`refresh_token:${refreshToken}`);
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    // Get all refresh tokens for user and delete them
    const keys = await redis.keys(`refresh_token:*`);
    for (const key of keys) {
      const tokenData = await redis.get(key);
      if (tokenData) {
        const { userId: tokenUserId } = JSON.parse(tokenData);
        if (tokenUserId === userId) {
          await redis.del(key);
        }
      }
    }
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwtSecret) as TokenPayload;
    } catch {
      throw new AppError('Invalid access token', 401);
    }
  }
}

