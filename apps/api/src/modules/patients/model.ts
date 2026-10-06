import type { Patient } from '@dental/contracts';
import type { SecretBox } from '../../platform/secret-box.js';

/** A patient row and the shape the API returns for it. */

export interface PatientRow {
  id: string;
  file_number: number;
  given_name: string;
  family_name: string;
  birth_date: string;
  sex: string;
  phone: string | null;
  phone_digits: string | null;
  email: string | null;
  national_id_encrypted: string | null;
  national_id_index: string | null;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export const PATIENT_COLUMNS = `id, file_number, given_name, family_name, birth_date, sex, phone,
  phone_digits, email, national_id_encrypted, national_id_index, status, version, created_at,
  updated_at`;

/** The API's patient shape lives in the contracts so the web client shares it. */
export type PatientView = Patient;

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Upper case without spaces or hyphens, so "ab 12-34" and "AB1234" match. */
export function normalizeNationalId(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function maskNationalId(value: string): string {
  const visible = value.length > 6 ? 4 : 2;
  return `${'•'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
}

export function toView(row: PatientRow, secrets: SecretBox): PatientView {
  return {
    id: row.id,
    fileNumber: row.file_number,
    givenName: row.given_name,
    familyName: row.family_name,
    birthDate: row.birth_date,
    sex: row.sex,
    phone: row.phone,
    email: row.email,
    nationalId: row.national_id_encrypted
      ? maskNationalId(secrets.decrypt(row.national_id_encrypted))
      : null,
    status: row.status,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
