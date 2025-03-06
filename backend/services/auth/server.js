/**
 * Authentication Service
 * Handles user authentication, tenant management, and authorization
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dental_auth',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Test database connection
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected');
  }
});

// Middleware for JWT authentication
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET || 'development_secret_key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health check route
app.get('/api/auth/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'auth-service' });
});

// Register new tenant (sign-up)
app.post('/api/auth/tenants/register', async (req, res) => {
  const { name, domain, email, password, plan } = req.body;

  if (!name || !domain || !email || !password || !plan) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if domain already exists
      const domainCheck = await client.query(
        'SELECT * FROM public.tenants WHERE domain = $1',
        [domain]
      );

      if (domainCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Domain already registered' });
      }

      // Insert new tenant
      const tenantId = uuidv4();
      await client.query(
        `INSERT INTO public.tenants 
        (id, name, domain, subscription_plan, subscription_status) 
        VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, name, domain, plan, 'active']
      );

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert admin user for tenant
      const userId = uuidv4();
      await client.query(
        `INSERT INTO public.users 
        (id, tenant_id, email, password_hash, role, is_active) 
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, tenantId, email, hashedPassword, 'admin', true]
      );

      await client.query('COMMIT');

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId, 
          email, 
          tenantId, 
          role: 'admin' 
        },
        process.env.JWT_SECRET || 'development_secret_key',
        { expiresIn: '24h' }
      );

      res.status(201).json({ 
        message: 'Tenant registered successfully',
        tenantId,
        userId,
        token
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error registering tenant:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, domain } = req.body;

  if (!email || !password || !domain) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find tenant by domain
    const tenantResult = await pool.query(
      'SELECT * FROM public.tenants WHERE domain = $1 AND is_active = true',
      [domain]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found or inactive' });
    }

    const tenant = tenantResult.rows[0];

    // Find user by email and tenant
    const userResult = await pool.query(
      'SELECT * FROM public.users WHERE email = $1 AND tenant_id = $2 AND is_active = true',
      [email, tenant.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        tenantId: tenant.id, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'development_secret_key',
      { expiresIn: '24h' }
    );

    res.status(200).json({ 
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantDomain: tenant.domain
      }
    });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateJWT, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, tenant_id, email, role, first_name, last_name FROM public.users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get tenant info
    const tenantResult = await pool.query(
      'SELECT id, name, domain, subscription_plan, subscription_status FROM public.tenants WHERE id = $1',
      [user.tenant_id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = tenantResult.rows[0];

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        subscriptionPlan: tenant.subscription_plan,
        subscriptionStatus: tenant.subscription_status
      }
    });
  } catch (err) {
    console.error('Error fetching user data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new user within a tenant
app.post('/api/auth/users', authenticateJWT, async (req, res) => {
  // Only admins can create users
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { email, password, role, firstName, lastName } = req.body;
  const tenantId = req.user.tenantId;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM public.users WHERE email = $1 AND tenant_id = $2',
      [email, tenantId]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const userId = uuidv4();
    await pool.query(
      `INSERT INTO public.users 
      (id, tenant_id, email, password_hash, role, first_name, last_name, is_active) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, tenantId, email, hashedPassword, role, firstName, lastName, true]
    );

    res.status(201).json({ 
      message: 'User created successfully',
      userId
    });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Token verification endpoint
app.post('/api/auth/verify', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'development_secret_key');
    res.status(200).json({ 
      valid: true, 
      user: decoded 
    });
  } catch (err) {
    res.status(200).json({ valid: false });
  }
});

// Change password
app.put('/api/auth/password', authenticateJWT, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Get user's current password
    const userResult = await pool.query(
      'SELECT password_hash FROM public.users WHERE id = $1',
      [req.user.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await pool.query(
      'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.userId]
    );
    
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Authentication service running on port ${PORT}`);
}); 