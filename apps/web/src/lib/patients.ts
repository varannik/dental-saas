import type { Patient } from '@dental/contracts';
import { ApiError } from './api';

/** Pure helpers for the patient screens, kept out of the components so they can be tested. */

export interface PatientForm {
  givenName: string;
  familyName: string;
  birthDate: string;
  sex: string;
  phone: string;
  email: string;
  nationalId: string;
}

export const EMPTY_FORM: PatientForm = {
  givenName: '',
  familyName: '',
  birthDate: '',
  sex: '',
  phone: '',
  email: '',
  nationalId: '',
};

/** Whole years on the given day. */
export function ageOn(birthDate: string, today = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  let age = today.getFullYear() - year;
  const beforeBirthday =
    today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/** The body for POST /v1/patients: empty optional fields are left out. */
export function createBody(form: PatientForm, force = false): Record<string, unknown> {
  const body: Record<string, unknown> = {
    givenName: form.givenName.trim(),
    familyName: form.familyName.trim(),
    birthDate: form.birthDate,
    sex: form.sex,
  };
  for (const key of ['phone', 'email', 'nationalId'] as const) {
    const value = form[key].trim();
    if (value) body[key] = value;
  }
  if (force) body.force = true;
  return body;
}

/**
 * The body for PATCH /v1/patients/:id: only what changed. A cleared optional field becomes
 * null, which removes it. The national ID is sent only when a new one is typed, because the
 * form shows a masked value.
 */
export function updateBody(patient: Patient, form: PatientForm): Record<string, unknown> {
  const body: Record<string, unknown> = { version: patient.version };
  const set = (key: string, next: string, current: string | null) => {
    if (next !== (current ?? '')) body[key] = next === '' ? null : next;
  };
  set('givenName', form.givenName.trim(), patient.givenName);
  set('familyName', form.familyName.trim(), patient.familyName);
  set('birthDate', form.birthDate, patient.birthDate);
  set('sex', form.sex, patient.sex);
  set('phone', form.phone.trim(), patient.phone);
  set('email', form.email.trim(), patient.email);
  if (form.nationalId.trim()) body.nationalId = form.nationalId.trim();
  return body;
}

export function formFrom(patient: Patient): PatientForm {
  return {
    givenName: patient.givenName,
    familyName: patient.familyName,
    birthDate: patient.birthDate,
    sex: patient.sex,
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    nationalId: '',
  };
}

/** Field messages from a 400 validation_failed problem, keyed by field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'validation_failed') return {};
  const issues = Array.isArray(error.body.issues) ? error.body.issues : [];
  const result: Record<string, string> = {};
  for (const issue of issues as { path?: string; message?: string }[]) {
    if (issue.path && issue.message && !result[issue.path]) result[issue.path] = issue.message;
  }
  return result;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
