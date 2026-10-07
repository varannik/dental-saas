import { describe, expect, it } from 'vitest';
import {
  clinicOnboard,
  clinicUpdateSettings,
  COMMANDS,
  historyAdd,
  isCommandType,
  patientCreate,
  patientUpdate,
  RISK_TIERS,
} from './commands.js';
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

  it('keeps platform operations out of every clinic role', () => {
    for (const keys of Object.values(ROLE_PERMISSIONS)) {
      expect(keys).not.toContain('platform.manage');
    }
  });

  it('validates clinic onboarding', () => {
    const valid = {
      name: 'Tehran Smile',
      country: 'IR',
      currency: 'IRR',
      timezone: 'Asia/Tehran',
      defaultLocale: 'fa-IR',
      regulatoryProfile: 'standard',
      admin: { email: 'Owner@Example.com', passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$x' },
    };
    const parsed = clinicOnboard.payload.parse(valid);
    expect(parsed.toothNotation).toBe('FDI');
    expect(parsed.admin.email).toBe('owner@example.com');
    const fails = (change: Record<string, unknown>) =>
      clinicOnboard.payload.safeParse({ ...valid, ...change }).success === false;
    expect(fails({ country: 'Iran' })).toBe(true);
    expect(fails({ currency: 'EURO' })).toBe(true);
    expect(fails({ toothNotation: 'Universal' })).toBe(true);
    expect(fails({ admin: { email: 'x@y.z', passwordHash: 'plain-text' } })).toBe(true);
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

  it('validates patients and redacts the national ID for the command log', () => {
    const valid = {
      givenName: 'Sara',
      familyName: 'Ahmed',
      birthDate: '1990-04-12',
      sex: 'female',
      phone: '+44 7700 900123',
      nationalId: 'AB 12 34 56 C',
    };
    const parsed = patientCreate.payload.parse(valid);
    expect(parsed.force).toBe(false);
    expect(patientCreate.redact!(parsed)).toMatchObject({
      nationalId: '[redacted]',
      givenName: 'Sara',
    });

    const fails = (change: Record<string, unknown>) =>
      !patientCreate.payload.safeParse({ ...valid, ...change }).success;
    expect(fails({ birthDate: '2999-01-01' })).toBe(true);
    expect(fails({ birthDate: '1990-02-30' })).toBe(true);
    expect(fails({ phone: 'call me' })).toBe(true);
    expect(fails({ sex: 'f' })).toBe(true);
    expect(fails({ givenName: '' })).toBe(true);

    const id = '0192f3a1-7c1e-7d7a-9b0e-3d2a4c5e6f70';
    expect(
      patientUpdate.payload.safeParse({ patientId: id, version: 1, phone: null }).success
    ).toBe(true);
    expect(patientUpdate.payload.safeParse({ patientId: id, version: 1 }).success).toBe(false);
  });

  it('validates history entries', () => {
    const patientId = '0192f3a1-7c1e-7d7a-9b0e-3d2a4c5e6f70';
    const ok = (payload: Record<string, unknown>) =>
      historyAdd.payload.safeParse({ patientId, ...payload }).success;
    expect(ok({ kind: 'allergy', label: 'Penicillin', severity: 'severe', detail: 'Rash' })).toBe(
      true
    );
    expect(ok({ kind: 'medication', label: 'Warfarin', detail: '5 mg daily' })).toBe(true);
    expect(ok({ kind: 'condition', label: 'Diabetes', severity: 'mild' })).toBe(false);
    expect(ok({ kind: 'habit', label: 'x' })).toBe(false);
    expect(ok({ kind: 'risk_factor', label: 'Smoker', onsetDate: '2999-01-01' })).toBe(false);
  });

  it('lets assistants suggest diagnoses but only dentists confirm them', () => {
    expect(ROLE_PERMISSIONS.assistant).toContain('diagnosis.suggest');
    expect(ROLE_PERMISSIONS.assistant).not.toContain('diagnosis.write');
    expect(COMMANDS['diagnosis.confirm'].permission).toBe('diagnosis.write');
    expect(COMMANDS['diagnosis.suggest'].permission).toBe('diagnosis.suggest');
    const sessionId = '0192f3a1-7c1e-7d7a-9b0e-3d2a4c5e6f70';
    const ok = (payload: Record<string, unknown>) =>
      COMMANDS['diagnosis.suggest'].payload.safeParse({ sessionId, ...payload }).success;
    expect(ok({ tooth: '16', code: 'irreversible_pulpitis', certainty: 'probable' })).toBe(true);
    expect(ok({ code: 'gingivitis' })).toBe(true);
    expect(ok({ code: 'other' })).toBe(false);
    expect(ok({ tooth: '19', code: 'pulp_necrosis' })).toBe(false);
    expect(
      COMMANDS['diagnosis.retract'].payload.safeParse({ diagnosisId: sessionId }).success
    ).toBe(false);
  });
});
