import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service';
import { LoginDto, RegisterDto } from '../types/auth.types';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  register = async (request: FastifyRequest<{ Body: RegisterDto }>, reply: FastifyReply) => {
    const result = await this.authService.register(request.body);
    return reply.status(201).send(result);
  };

  login = async (request: FastifyRequest<{ Body: LoginDto }>, reply: FastifyReply) => {
    const result = await this.authService.login(request.body);
    
    // Set refresh token as HTTP-only cookie
    reply.setCookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return reply.send({
      user: result.user,
      accessToken: result.accessToken,
    });
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies.refreshToken;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    reply.clearCookie('refreshToken');
    return reply.send({ message: 'Logged out successfully' });
  };

  refreshToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      return reply.status(401).send({ error: 'Refresh token not found' });
    }

    const result = await this.authService.refreshToken(refreshToken);
    return reply.send(result);
  };

  getCurrentUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await this.authService.getUserById((request.user as { id: string }).id);
    return reply.send({ user });
  };

  forgotPassword = async (request: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) => {
    await this.authService.forgotPassword(request.body.email);
    return reply.send({ message: 'Password reset email sent' });
  };

  resetPassword = async (
    request: FastifyRequest<{ Body: { token: string; password: string } }>,
    reply: FastifyReply
  ) => {
    await this.authService.resetPassword(request.body.token, request.body.password);
    return reply.send({ message: 'Password reset successful' });
  };

  verifyEmail = async (
    request: FastifyRequest<{ Querystring: { token: string } }>,
    reply: FastifyReply
  ) => {
    await this.authService.verifyEmail(request.query.token);
    return reply.send({ message: 'Email verified successfully' });
  };

  changePassword = async (
    request: FastifyRequest<{ Body: { currentPassword: string; newPassword: string } }>,
    reply: FastifyReply
  ) => {
    const userId = (request.user as { id: string }).id;
    await this.authService.changePassword(userId, request.body.currentPassword, request.body.newPassword);
    return reply.send({ message: 'Password changed successfully' });
  };
}

