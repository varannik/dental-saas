import { Router } from 'express';
import passport from 'passport';
import session from 'express-session';
import { SocialAuthController } from '../controllers/social.controller';

const router = Router();

// Initialize session middleware for OAuth flow
router.use(session({
  secret: process.env.SESSION_SECRET || 'social-auth-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000 // 10 minutes
  }
}));

// Controller will be properly injected in a real implementation
const socialAuthController = {} as any;

/**
 * @swagger
 * /api/auth/social/google:
 *   get:
 *     summary: Initiate Google authentication
 *     tags: [Social Authentication]
 *     parameters:
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *         required: true
 *         description: Tenant domain
 *     responses:
 *       302:
 *         description: Redirects to Google authentication
 */
router.get(
  '/google',
  (req, res, next) => {
    // Store domain in session for callback
    if (req.query.domain) {
      req.session.domain = req.query.domain as string;
    }
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

/**
 * @swagger
 * /api/auth/social/google/callback:
 *   get:
 *     summary: Handle Google authentication callback
 *     tags: [Social Authentication]
 *     responses:
 *       302:
 *         description: Redirects to frontend with tokens
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/api/auth/social/failure',
    session: false
  }),
  socialAuthController.handleSocialCallback
);

/**
 * @swagger
 * /api/auth/social/failure:
 *   get:
 *     summary: Handle failed social authentication
 *     tags: [Social Authentication]
 *     responses:
 *       401:
 *         description: Authentication failed
 */
router.get('/failure', (req, res) => {
  res.status(401).json({ error: 'Authentication failed' });
});

export default router; 