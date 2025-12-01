import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { UserRepository } from '../repositories/user.repository';
import { TokenService } from './token.service';
import { LoginDto, RegisterDto, AuthResult } from '../types/auth.types';
import { AppError } from '../utils/errors';

export class AuthService {
  private userRepository: UserRepository;
  private tokenService: TokenService;

  constructor() {
    this.userRepository = new UserRepository();
    this.tokenService = new TokenService();
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    // Check if user exists
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new AppError('Email already registered', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      emailVerificationToken: nanoid(),
    });

    // Generate tokens
    const { accessToken, refreshToken } = await this.tokenService.generateTokens(user);

    // TODO: Send verification email

    return {
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
      refreshToken,
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const { accessToken, refreshToken } = await this.tokenService.generateTokens(user);

    return {
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
      refreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  async refreshToken(token: string): Promise<{ accessToken: string }> {
    return this.tokenService.refreshAccessToken(token);
  }

  async getUserById(id: string) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return; // Don't reveal if email exists

    const resetToken = nanoid();
    await this.userRepository.setPasswordResetToken(user.id, resetToken);

    // TODO: Send password reset email
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findByPasswordResetToken(token);
    if (!user) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userRepository.updatePassword(user.id, hashedPassword);
    await this.tokenService.revokeAllUserTokens(user.id);
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.userRepository.findByEmailVerificationToken(token);
    if (!user) {
      throw new AppError('Invalid verification token', 400);
    }

    await this.userRepository.markEmailVerified(user.id);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userRepository.updatePassword(userId, hashedPassword);
  }
}

