import { describe, expect, it } from 'vitest';
import { clinicUpdateSettings, COMMANDS, isCommandType, RISK_TIERS } from './commands.js';
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

  it('registers every command under its own type with a known permission', () => {
    for (const [type, definition] of Object.entries(COMMANDS)) {
      expect(definition.type).toBe(type);
      expect(type).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
      expect(isPermissionKey(definition.permission)).toBe(true);
      expect(RISK_TIERS).toContain(definition.risk);
    }
    expect(isCommandType('clinic.update_settings')).toBe(true);
    expect(isCommandType('toString')).toBe(false);
  });

  it('validates clinic settings changes', () => {
    const parse = (payload: unknown) => clinicUpdateSettings.payload.safeParse(payload).success;
    expect(parse({ version: 1, name: 'Alpha Dental' })).toBe(true);
    expect(parse({ version: 1, timezone: 'Asia/Tehran', defaultLocale: 'fa-IR' })).toBe(true);
    expect(parse({ version: 1 })).toBe(false);
    expect(parse({ version: 1, timezone: 'Mars/Olympus' })).toBe(false);
    expect(parse({ version: 1, defaultLocale: 'english' })).toBe(false);
    expect(parse({ version: 1, name: 'x', currency: 'USD' })).toBe(false);
    expect(parse({ name: 'x' })).toBe(false);
  });
});
