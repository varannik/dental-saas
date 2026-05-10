import { describe, expect, it } from 'vitest';

import { firstHeader } from '../http-header.js';

describe('firstHeader', () => {
  it('returns first string when header is duplicated', () => {
    expect(firstHeader(['application/json; charset=utf-8', 'application/json'])).toBe(
      'application/json; charset=utf-8'
    );
  });

  it('passes through a single string', () => {
    expect(firstHeader('Bearer token')).toBe('Bearer token');
  });

  it('returns undefined for missing or empty', () => {
    expect(firstHeader(undefined)).toBeUndefined();
    expect(firstHeader('')).toBeUndefined();
  });
});
