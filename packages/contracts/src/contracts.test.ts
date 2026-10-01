import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './errors.js';
import { isPermissionKey, PERMISSIONS } from './permissions.js';

describe('contracts', () => {
  it('keeps permission keys unique and dotted', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const key of PERMISSIONS) {
      expect(key).toMatch(/^[a-z]+(\.[a-z]+)+$/);
      expect(isPermissionKey(key)).toBe(true);
    }
    expect(isPermissionKey('session.delete')).toBe(false);
  });

  it('keeps error codes unique', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
