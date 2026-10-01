import { describe, expect, it } from 'vitest';
import { start } from './start.js';

describe('start', () => {
  it('refuses to start when a required variable is missing', async () => {
    await expect(start({ NODE_ENV: 'test' })).rejects.toThrow(/DATABASE_URL/);
  });
});
