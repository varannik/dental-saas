import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient, TestClient } from '../helpers/api-client';
import { setupDatabase, teardownDatabase } from '../helpers/database';

describe('Auth API', () => {
  let client: TestClient;

  beforeAll(async () => {
    await setupDatabase();
    client = createTestClient();
  });

  afterAll(async () => {
    await teardownDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('should create a new user', async () => {
      const response = await client.post('/api/auth/register', {
        email: 'test@example.com',
        password: 'ValidPassword123',
        name: 'Test User',
      });

      expect(response.status).toBe(201);
      expect(response.data.user).toHaveProperty('id');
      expect(response.data.user.email).toBe('test@example.com');
      expect(response.data.accessToken).toBeDefined();
    });

    it('should return 400 for duplicate email', async () => {
      await client.post('/api/auth/register', {
        email: 'duplicate@example.com',
        password: 'ValidPassword123',
        name: 'First User',
      });

      const response = await client.post('/api/auth/register', {
        email: 'duplicate@example.com',
        password: 'ValidPassword123',
        name: 'Second User',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await client.post('/api/auth/login', {
        email: 'test@example.com',
        password: 'ValidPassword123',
      });

      expect(response.status).toBe(200);
      expect(response.data.accessToken).toBeDefined();
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await client.post('/api/auth/login', {
        email: 'test@example.com',
        password: 'WrongPassword',
      });

      expect(response.status).toBe(401);
    });
  });
});

