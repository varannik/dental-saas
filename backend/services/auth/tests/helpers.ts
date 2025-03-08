import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Role } from '../src/types/user.types';
import { Pool } from 'pg';

// Generate test tokens
export const generateTestTokens = (
  userId: string = uuidv4(), 
  tenantId: string = uuidv4(), 
  role: Role = Role.ADMIN
) => {
  const accessToken = jwt.sign(
    { userId, tenantId, role, email: 'test@example.com' },
    process.env.JWT_SECRET || 'test-jwt-secret',
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId, tokenId: uuidv4() },
    process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
};

// Mock request object
export const mockRequest = (overrides: Partial<Request> = {}): Partial<Request> => {
  const req: Partial<Request> = {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides
  };
  return req;
};

// Mock response object
export const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

// Create test database records
export const createTestData = async (db: Pool) => {
  const tenantId = uuidv4();
  const userId = uuidv4();
  
  // Create test tenant
  await db.query(
    `INSERT INTO tenants 
    (id, name, domain, subscription_plan, subscription_status, is_active) 
    VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, 'Test Tenant', 'test.example.com', 'basic', 'active', true]
  );
  
  // Create test user
  await db.query(
    `INSERT INTO users 
    (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, email_verified) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, tenantId, 'test@example.com', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'admin', 'Test', 'User', true, true]
  );
  
  return { tenantId, userId };
};

// Clean test database
export const cleanTestData = async (db: Pool) => {
  await db.query('DELETE FROM refresh_tokens');
  await db.query('DELETE FROM password_reset_tokens');
  await db.query('DELETE FROM email_verification_tokens');
  await db.query('DELETE FROM users');
  await db.query('DELETE FROM tenants');
}; 