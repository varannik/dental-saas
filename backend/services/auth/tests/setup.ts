import dotenv from 'dotenv';
import path from 'path';

// Load environment variables for testing
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Global setup for all tests
beforeAll(async () => {
  // Any global setup needed before tests run
  console.log('Starting test suite');
});

// Global teardown after all tests
afterAll(async () => {
  // Any cleanup needed after all tests
  console.log('Test suite completed');
}); 