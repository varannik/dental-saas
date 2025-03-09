import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import db from '../models/db';
import { logger } from '../utils/logger';
import { Role } from '../types/user.types';

/**
 * Initialize and configure Passport for social authentication
 */
export const initializePassport = (): passport.PassportStatic => {
  // Configure Google Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackURL: `${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/api/auth/social/google/callback`,
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          // Domain is passed in state parameter and stored in session
          const domain = req.session?.domain;
          if (!domain) {
            return done(new Error('No tenant domain provided'));
          }
          
          logger.info(`Processing Google authentication for domain: ${domain}`);
          
          // Find tenant by domain
          const tenantResult = await db.query(
            'SELECT * FROM tenants WHERE domain = $1 AND is_active = true',
            [domain]
          );
          
          if (tenantResult.rows.length === 0) {
            return done(new Error('Tenant not found or inactive'));
          }
          
          const tenant = tenantResult.rows[0];
          
          // Check if user exists
          const userEmail = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
          
          if (!userEmail) {
            return done(new Error('No email provided from Google'));
          }
          
          const userResult = await db.query(
            'SELECT * FROM users WHERE email = $1 AND tenant_id = $2',
            [userEmail, tenant.id]
          );
          
          let user;
          
          if (userResult.rows.length === 0) {
            // User doesn't exist, create one if auto-registration is enabled
            if (process.env.ALLOW_SOCIAL_REGISTRATION === 'true') {
              // Create new user
              const userId = uuidv4();
              const firstName = profile.name?.givenName || '';
              const lastName = profile.name?.familyName || '';
              
              await db.query(
                `INSERT INTO users 
                (id, tenant_id, email, role, first_name, last_name, is_active, email_verified, social_provider, social_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  userId, 
                  tenant.id, 
                  userEmail, 
                  Role.RECEPTIONIST, // Default role for social login
                  firstName,
                  lastName,
                  true, // is_active
                  true, // email_verified (since verified by provider)
                  'google',
                  profile.id
                ]
              );
              
              // Get the newly created user
              const newUserResult = await db.query(
                'SELECT * FROM users WHERE id = $1',
                [userId]
              );
              
              user = newUserResult.rows[0];
            } else {
              return done(null, false, { message: 'User not registered with this email' });
            }
          } else {
            user = userResult.rows[0];
            
            // Update social ID if not already set
            if (!user.social_id || !user.social_provider) {
              await db.query(
                `UPDATE users 
                SET social_id = $1, social_provider = $2, updated_at = NOW() 
                WHERE id = $3`,
                [profile.id, 'google', user.id]
              );
            }
          }
          
          // User found or created successfully
          return done(null, {
            userId: user.id,
            email: user.email,
            tenantId: tenant.id,
            role: user.role,
            provider: 'google'
          });
        } catch (err) {
          logger.error('Error in Google authentication strategy:', err);
          return done(err);
        }
      }
    )
  );
  
  // Serialization and deserialization for sessions
  passport.serializeUser((user, done) => {
    done(null, JSON.stringify(user));
  });
  
  passport.deserializeUser((data, done) => {
    try {
      done(null, JSON.parse(data as string));
    } catch (err) {
      done(err, null);
    }
  });
  
  return passport;
}; 