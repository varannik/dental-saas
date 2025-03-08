import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { TenantService } from '../services/tenant.service';
import { TokenService } from '../services/token.service';
import { LoginRequest, RefreshTokenRequest, PasswordResetRequest, ResetPasswordRequest, ChangePasswordRequest } from '../types/auth.types';
import { BadRequestError } from '../types/error.types';

export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private tenantService: TenantService,
    private tokenService: TokenService
  ) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, domain } = req.body as LoginRequest;
      
      const result = await this.authService.login(email, password, domain);
      
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as RefreshTokenRequest;
      
      if (!refreshToken) {
        throw new BadRequestError('Refresh token is required');
      }
      
      const accessToken = await this.authService.refreshToken(refreshToken);
      
      res.status(200).json({ accessToken });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };
      const authHeader = req.headers.authorization;
      
      await this.authService.logout(authHeader, refreshToken);
      
      res.status(200).json({ message: 'Logout successful' });
    } catch (err) {
      next(err);
    }
  };

  requestPasswordReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, domain } = req.body as PasswordResetRequest;
      
      await this.authService.requestPasswordReset(email, domain);
      
      res.status(200).json({ message: 'Password reset email sent' });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, password } = req.body as ResetPasswordRequest;
      
      await this.authService.resetPassword(token, password);
      
      res.status(200).json({ message: 'Password reset successful' });
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }
      
      const { currentPassword, newPassword } = req.body as ChangePasswordRequest;
      
      await this.authService.changePassword(req.user.userId, currentPassword, newPassword);
      
      res.status(200).json({ message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.query as { token?: string };
      
      if (!token) {
        throw new BadRequestError('Token is required');
      }
      
      await this.authService.verifyEmail(token);
      
      res.status(200).json({ message: 'Email verified successfully' });
    } catch (err) {
      next(err);
    }
  };

  getCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }
      
      const user = await this.userService.getUserById(req.user.userId, req.user.tenantId);
      
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  };
} 