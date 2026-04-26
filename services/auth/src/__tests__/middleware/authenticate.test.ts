import { describe, expect, it } from 'vitest';

import { parseBearerToken } from '../../middleware/authenticate.js';

describe('middleware/authenticate', () => {
  it('returns token for valid bearer header', () => {
    expect(parseBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns null for missing header', () => {
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it('returns null for invalid scheme', () => {
    expect(parseBearerToken('Basic foo')).toBeNull();
  });

  it('returns null for malformed bearer header', () => {
    expect(parseBearerToken('Bearer')).toBeNull();
  });
});
