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

  it('keeps the voice spike off by default', () => {
    const config = loadConfig(complete);
    expect(config.VOICE_SPIKE_ENABLED).toBe(false);
    expect(config.VOICE_LLM_MODEL).toBe('claude-haiku-4-5');
  });

  it('requires provider keys when the voice spike is on', () => {
    expect(() => loadConfig({ ...complete, VOICE_SPIKE_ENABLED: 'true' })).toThrow(
      /DEEPGRAM_API_KEY.*ANTHROPIC_API_KEY/
    );
    const config = loadConfig({
      ...complete,
      VOICE_SPIKE_ENABLED: 'true',
      DEEPGRAM_API_KEY: 'dg',
      ANTHROPIC_API_KEY: 'sk',
    });
    expect(config.VOICE_SPIKE_ENABLED).toBe(true);
  });

  it('requires the key of the default interpreter only', () => {
    const openaiOnly = {
      ...complete,
      VOICE_SPIKE_ENABLED: 'true',
      DEEPGRAM_API_KEY: 'dg',
      OPENAI_API_KEY: 'sk-oai',
    };
    expect(() => loadConfig(openaiOnly)).toThrow(/ANTHROPIC_API_KEY/);
    const config = loadConfig({ ...openaiOnly, VOICE_INTERPRETER: 'openai' });
    expect(config.VOICE_INTERPRETER).toBe('openai');
    expect(config.OPENAI_MODEL).toBe('gpt-4.1-mini');
    expect(() => loadConfig({ ...openaiOnly, VOICE_INTERPRETER: 'mistral' })).toThrow(
      /VOICE_INTERPRETER/
    );
  });

  it('accepts Run BiOS as the default interpreter', () => {
    const config = loadConfig({
      ...complete,
      VOICE_SPIKE_ENABLED: 'true',
      DEEPGRAM_API_KEY: 'dg',
      RUNBIOS_API_KEY: 'bios-key',
      VOICE_INTERPRETER: 'runbios',
    });
    expect(config.RUNBIOS_MODEL).toBe('openai/gpt-4.1-mini');
    expect(config.RUNBIOS_BASE_URL).toBe('https://api.runbios.ai/v1');
    expect(() =>
      loadConfig({
        ...complete,
        VOICE_SPIKE_ENABLED: 'true',
        DEEPGRAM_API_KEY: 'dg',
        VOICE_INTERPRETER: 'runbios',
      })
    ).toThrow(/RUNBIOS_API_KEY/);
  });

  it('treats an empty key in .env as unset', () => {
    const config = loadConfig({ ...complete, OPENAI_API_KEY: '', DEEPGRAM_API_KEY: '' });
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.DEEPGRAM_API_KEY).toBeUndefined();
  });

  it('refuses the voice spike in production', () => {
    expect(() =>
      loadConfig({
        ...complete,
        NODE_ENV: 'production',
        VOICE_SPIKE_ENABLED: 'true',
        DEEPGRAM_API_KEY: 'dg',
        ANTHROPIC_API_KEY: 'sk',
      })
    ).toThrow(/must not run in production/);
  });
});
