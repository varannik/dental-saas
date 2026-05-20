import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getReflectOrigin,
  isLocalDevBrowserOrigin,
  isOriginAllowed,
  resolveCorsOrigin,
} from '../cors.js';

describe('resolveCorsOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses explicit CORS_ORIGINS when set', () => {
    vi.stubEnv('CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000');
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveCorsOrigin()).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
  });

  it('reflects any origin when CORS_ORIGINS is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGINS', '');
    expect(resolveCorsOrigin()).toBe(true);
  });

  it('matches LAN browser origins for optional checks', () => {
    expect(isLocalDevBrowserOrigin('http://192.168.0.50:3000')).toBe(true);
    expect(isLocalDevBrowserOrigin('https://evil.example')).toBe(false);
  });
});

describe('isOriginAllowed / getReflectOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows listed origins when CORS_ORIGINS is set', () => {
    vi.stubEnv('CORS_ORIGINS', 'http://localhost:3000');
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://evil.test')).toBe(false);
    expect(getReflectOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('allows local dev origins when CORS_ORIGINS is unset', () => {
    vi.stubEnv('CORS_ORIGINS', '');
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
    expect(getReflectOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });
});
