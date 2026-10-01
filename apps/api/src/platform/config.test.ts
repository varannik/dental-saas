import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const complete = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/dental',
  VALKEY_URL: 'redis://localhost:6380',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_BUCKET: 'dental',
  S3_ACCESS_KEY: 'dev',
  S3_SECRET_KEY: 'devsecret',
  NEO4J_URI: 'bolt://localhost:7687',
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: 'devpassword',
};

describe('loadConfig', () => {
  it('accepts a complete environment and fills defaults', () => {
    const config = loadConfig(complete);
    expect(config.PORT).toBe(4000);
    expect(config.DATABASE_URL).toBe(complete.DATABASE_URL);
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('refuses to start when a required variable is missing', () => {
    const env = { ...complete };
    delete env.DATABASE_URL;
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it('refuses a malformed connection string', () => {
    expect(() => loadConfig({ ...complete, VALKEY_URL: 'not a url' })).toThrow(ConfigError);
  });
});
