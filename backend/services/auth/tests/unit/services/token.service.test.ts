import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TokenService } from '../../../src/services/token.service';
import { TokenRepositoryInterface } from '../../../src/repositories/token.repository';
import { RedisService } from '../../../src/services/redis.service';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { UnauthorizedError } from '../../../src/types/error.types';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('uuid');

describe('TokenService', () => {
  let tokenService: TokenService;
  let mockTokenRepository: jest.Mocked<TokenRepositoryInterface>;
  let mockRedisService: jest.Mocked<RedisService>;

  beforeEach(() => {
    // Create mock implementations
    mockTokenRepository = {
      saveRefreshToken: jest.fn(),
      getRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllUserTokens: jest.fn(),
      saveEmailVerificationToken: jest.fn(),
      getEmailVerificationToken: jest.fn(),
      useEmailVerificationToken: jest.fn(),
      savePasswordResetToken: jest.fn(),
      getPasswordResetToken: jest.fn(),
      usePasswordResetToken: jest.fn()
    };

    mockRedisService = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      blacklistToken: jest.fn(),
      isTokenBlacklisted: jest.fn()
    };

    // Create service with mocked dependencies
    tokenService = new TokenService(mockTokenRepository, mockRedisService);

    // Mock environment variables
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_ACCESS_EXPIRY = '15m';
    process.env.JWT_REFRESH_EXPIRY = '7d';

    // Mock uuid
    (uuidv4 as jest.Mock).mockReturnValue('mock-uuid');
  });

  describe('generateAccessToken', () => {
    it('should generate and sign a JWT token', () => {
      // Arrange
      const payload = { userId: 'user-123', email: 'test@example.com', tenantId: 'tenant-123', role: 'admin' };
      (jwt.sign as jest.Mock).mockReturnValue('mock-access-token');

      // Act
      const token = tokenService.generateAccessToken(payload);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        payload,
        'test-jwt-secret',
        { expiresIn: '15m', algorithm: 'HS256' }
      );
      expect(token).toBe('mock-access-token');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate and store a refresh token', async () => {
      // Arrange
      const userId = 'user-123';
      (jwt.sign as jest.Mock).mockReturnValue('mock-refresh-token');
      
      // Act
      const token = await tokenService.generateRefreshToken(userId);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId, tokenId: 'mock-uuid' },
        'test-refresh-secret',
        { expiresIn: '7d', algorithm: 'HS256' }
      );
      expect(mockTokenRepository.saveRefreshToken).toHaveBeenCalledWith({
        id: 'mock-uuid',
        userId,
        token: 'mock-refresh-token',
        expiresAt: expect.any(Date),
        revoked: false
      });
      expect(token).toBe('mock-refresh-token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify and return the token data when valid', async () => {
      // Arrange
      const refreshToken = 'valid-refresh-token';
      const decodedToken = { userId: 'user-123', tokenId: 'token-123' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      
      mockTokenRepository.getRefreshToken.mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        token: 'valid-refresh-token',
        expiresAt: new Date(Date.now() + 86400000), // 1 day in the future
        revoked: false,
        createdAt: new Date()
      });
      
      // Act
      const result = await tokenService.verifyRefreshToken(refreshToken);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(
        refreshToken,
        'test-refresh-secret',
        expect.any(Object)
      );
      expect(mockTokenRepository.getRefreshToken).toHaveBeenCalledWith('token-123', 'user-123');
      expect(result).toEqual(decodedToken);
    });

    it('should throw error when token is revoked', async () => {
      // Arrange
      const refreshToken = 'revoked-refresh-token';
      const decodedToken = { userId: 'user-123', tokenId: 'token-123' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      
      mockTokenRepository.getRefreshToken.mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        token: 'revoked-refresh-token',
        expiresAt: new Date(Date.now() + 86400000),
        revoked: true,
        createdAt: new Date()
      });
      
      // Act & Assert
      await expect(tokenService.verifyRefreshToken(refreshToken))
        .rejects.toThrow(UnauthorizedError);
    });

    it('should throw error when token is expired', async () => {
      // Arrange
      const refreshToken = 'expired-refresh-token';
      const decodedToken = { userId: 'user-123', tokenId: 'token-123' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      
      mockTokenRepository.getRefreshToken.mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        token: 'expired-refresh-token',
        expiresAt: new Date(Date.now() - 86400000), // 1 day in the past
        revoked: false,
        createdAt: new Date()
      });
      
      // Act & Assert
      await expect(tokenService.verifyRefreshToken(refreshToken))
        .rejects.toThrow(UnauthorizedError);
    });
  });

  describe('blacklistAccessToken', () => {
    it('should add token to blacklist with correct expiry time', async () => {
      // Arrange
      const token = 'access-token-to-blacklist';
      const decodedToken = { exp: Math.floor(Date.now() / 1000) + 900 }; // 15 minutes from now
      (jwt.decode as jest.Mock).mockReturnValue(decodedToken);
      
      // Act
      await tokenService.blacklistAccessToken(token);
      
      // Assert
      expect(jwt.decode).toHaveBeenCalledWith(token);
      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith(
        token,
        expect.any(Number)
      );
    });
    
    it('should return true if token is already expired', async () => {
      // Arrange
      const token = 'expired-access-token';
      const decodedToken = { exp: Math.floor(Date.now() / 1000) - 60 }; // 1 minute ago
      (jwt.decode as jest.Mock).mockReturnValue(decodedToken);
      
      // Act
      const result = await tokenService.blacklistAccessToken(token);
      
      // Assert
      expect(result).toBe(true);
      expect(mockRedisService.blacklistToken).not.toHaveBeenCalled();
    });
  });
}); 