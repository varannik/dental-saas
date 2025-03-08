import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { TokenRepositoryInterface } from '../repositories/token.repository';
import { RedisService } from './redis.service';
import { AccessTokenPayload, RefreshTokenPayload } from '../types/auth.types';
import { UnauthorizedError } from '../types/error.types';

export class TokenService {
  constructor(
    private tokenRepository: TokenRepositoryInterface,
    private redisService: RedisService
  ) {}

  generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(
      payload,
      process.env.JWT_SECRET!,
      { 
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
        algorithm: 'HS256'
      }
    );
  }

  async generateRefreshToken(userId: string): Promise<string> {
    try {
      const tokenId = uuidv4();
      const expiresIn = process.env.JWT_REFRESH_EXPIRY || '7d';
      
      // Calculate expiry date
      const expiryDate = new Date();
      if (expiresIn.endsWith('d')) {
        const days = parseInt(expiresIn.slice(0, -1), 10) || 7;
        expiryDate.setDate(expiryDate.getDate() + days);
      } else if (expiresIn.endsWith('h')) {
        const hours = parseInt(expiresIn.slice(0, -1), 10) || 24;
        expiryDate.setHours(expiryDate.getHours() + hours);
      } else if (expiresIn.endsWith('m')) {
        const minutes = parseInt(expiresIn.slice(0, -1), 10) || 60;
        expiryDate.setMinutes(expiryDate.getMinutes() + minutes);
      }
      
      // Create refresh token
      const refreshToken = jwt.sign(
        { userId, tokenId } as RefreshTokenPayload,
        process.env.JWT_REFRESH_SECRET!,
        { 
          expiresIn,
          algorithm: 'HS256'
        }
      );
      
      // Store refresh token in database
      await this.tokenRepository.saveRefreshToken({
        id: tokenId,
        userId,
        token: refreshToken,
        expiresAt: expiryDate,
        revoked: false
      });
      
      return refreshToken;
    } catch (err) {
      console.error('Error generating refresh token:', err);
      throw err;
    }
  }

  async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      // Verify token signature
      const decoded = jwt.verify(
        refreshToken, 
        process.env.JWT_REFRESH_SECRET!,
        { algorithms: ['HS256'] }
      ) as RefreshTokenPayload;
      
      // Check if token exists in database and is not revoked
      const tokenRecord = await this.tokenRepository.getRefreshToken(decoded.tokenId, decoded.userId);
      
      if (!tokenRecord) {
        throw new UnauthorizedError('Invalid refresh token');
      }
      
      if (tokenRecord.revoked) {
        throw new UnauthorizedError('Invalid refresh token');
      }
      
      // Check if token is expired
      if (new Date() > tokenRecord.expiresAt) {
        // Revoke expired token
        await this.tokenRepository.revokeRefreshToken(decoded.tokenId);
        throw new UnauthorizedError('Refresh token expired');
      }
      
      return decoded;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  async revokeRefreshToken(tokenId: string): Promise<boolean> {
    try {
      await this.tokenRepository.revokeRefreshToken(tokenId);
      return true;
    } catch (err) {
      console.error('Error revoking refresh token:', err);
      return false;
    }
  }

  async revokeAllUserTokens(userId: string): Promise<boolean> {
    try {
      await this.tokenRepository.revokeAllUserTokens(userId);
      return true;
    } catch (err) {
      console.error('Error revoking all user tokens:', err);
      return false;
    }
  }

  async blacklistAccessToken(token: string): Promise<boolean> {
    try {
      // Decode token to get expiry time
      const decoded = jwt.decode(token) as AccessTokenPayload & { exp?: number };
      if (!decoded || !decoded.exp) {
        return false;
      }
      
      // Calculate remaining time in seconds
      const expiryTime = decoded.exp - Math.floor(Date.now() / 1000);
      if (expiryTime <= 0) {
        return true; // Token already expired
      }
      
      // Add to Redis blacklist
      await this.redisService.blacklistToken(token, expiryTime);
      return true;
    } catch (err) {
      console.error('Error blacklisting access token:', err);
      return false;
    }
  }

  // Additional methods for email verification, password reset tokens, etc.
  // Implementation would follow similar patterns as above
} 