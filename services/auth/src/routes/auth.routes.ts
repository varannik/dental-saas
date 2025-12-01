import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validation.middleware';
import { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema } from '../schemas/auth.schema';

export async function authRoutes(app: FastifyInstance) {
  const controller = new AuthController();

  // Public routes
  app.post('/register', { preHandler: [validateBody(registerSchema)] }, controller.register);
  app.post('/login', { preHandler: [validateBody(loginSchema)] }, controller.login);
  app.post('/refresh', controller.refreshToken);
  app.post('/forgot-password', { preHandler: [validateBody(forgotPasswordSchema)] }, controller.forgotPassword);
  app.post('/reset-password', { preHandler: [validateBody(resetPasswordSchema)] }, controller.resetPassword);
  app.get('/verify-email', controller.verifyEmail);

  // Protected routes
  app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    protectedApp.get('/me', controller.getCurrentUser);
    protectedApp.post('/logout', controller.logout);
    protectedApp.post('/change-password', controller.changePassword);
  });
}

