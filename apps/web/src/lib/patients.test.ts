import type { Patient } from '@dental/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { ageOn, createBody, EMPTY_FORM, fieldErrors, formFrom, updateBody } from './patients';

const patient: Patient = {
  id: 'p1',
  fileNumber: 7,
  givenName: 'Sara',
  familyName: 'Ahmed',
  birthDate: '1990-04-12',
  sex: 'female',
  phone: '+44 7700 900123',
  email: null,
  nationalId: '•••••456C',
  status: 'active',
  version: 3,
  createdAt: '2026-10-05T10:00:00.000Z',
  updatedAt: '2026-10-05T10:00:00.000Z',
};

describe('ageOn', () => {
  it('counts whole years, turning on the birthday', () => {
    expect(ageOn('1990-04-12', new Date(2026, 3, 11))).toBe(35);
    expect(ageOn('1990-04-12', new Date(2026, 3, 12))).toBe(36);
    expect(ageOn('2000-02-29', new Date(2026, 1, 28))).toBe(25);
  });
});

describe('createBody', () => {
  it('trims values and leaves out empty optional fields', () => {
    const body = createBody({
      ...EMPTY_FORM,
      givenName: ' Sara ',
      familyName: 'Ahmed',
      birthDate: '1990-04-12',
      sex: 'female',
      phone: '  ',
      email: 'sara@example.com',
    });
    expect(body).toEqual({
      givenName: 'Sara',
      familyName: 'Ahmed',
      birthDate: '1990-04-12',
      sex: 'female',
      email: 'sara@example.com',
    });
    expect(createBody(EMPTY_FORM, true).force).toBe(true);
  });
});

describe('updateBody', () => {
  it('sends only what changed, with the version', () => {
    const form = { ...formFrom(patient), phone: '+44 7700 900999' };
    expect(updateBody(patient, form)).toEqual({ version: 3, phone: '+44 7700 900999' });
  });

  it('clears a removed value with null and adds a new one', () => {
    const form = { ...formFrom(patient), phone: '', email: 'sara@example.com' };
    expect(updateBody(patient, form)).toEqual({
      version: 3,
      phone: null,
      email: 'sara@example.com',
    });
  });

  it('sends the national ID only when a new one is typed', () => {
    expect(formFrom(patient).nationalId).toBe('');
    expect(updateBody(patient, formFrom(patient))).toEqual({ version: 3 });
    expect(updateBody(patient, { ...formFrom(patient), nationalId: 'ZZ998877A' })).toEqual({
      version: 3,
      nationalId: 'ZZ998877A',
    });
  });
});

describe('fieldErrors', () => {
  it('maps validation issues to fields, first message wins', () => {
    const error = new ApiError(400, 'validation_failed', {
      issues: [
        { path: 'birthDate', message: 'Enter a real date of birth, not in the future.' },
        { path: 'birthDate', message: 'second' },
        { path: 'phone', message: 'Enter a phone number.' },
      ],
    });
    expect(fieldErrors(error)).toEqual({
      birthDate: 'Enter a real date of birth, not in the future.',
      phone: 'Enter a phone number.',
    });
  });

  it('ignores other errors', () => {
    expect(fieldErrors(new ApiError(409, 'possible_duplicate', {}))).toEqual({});
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});
