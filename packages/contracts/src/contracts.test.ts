import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './errors.js';
import { isPermissionKey, PERMISSIONS } from './permissions.js';
import { MFA_REQUIRED_ROLES, ROLE_PERMISSIONS, SYSTEM_ROLES } from './roles.js';

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

  it('maps every system role to known permissions', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...SYSTEM_ROLES].sort());
    for (const keys of Object.values(ROLE_PERMISSIONS)) {
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) expect(isPermissionKey(key)).toBe(true);
    }
    for (const role of MFA_REQUIRED_ROLES) expect(SYSTEM_ROLES).toContain(role);
  });

  it('keeps signing and diagnosis confirmation with dentists only', () => {
    for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === 'dentist') continue;
      expect(keys).not.toContain('session.sign');
      expect(keys).not.toContain('diagnosis.write');
    }
  });

  it('keeps researchers and reviewers away from patient data', () => {
    for (const role of ['researcher', 'reviewer'] as const) {
      expect(ROLE_PERMISSIONS[role].some((key) => key.startsWith('patient.'))).toBe(false);
    }
  });
});
