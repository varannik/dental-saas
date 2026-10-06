/** Response shapes of the patient endpoints, shared by the API and the web client. */

export const PATIENT_SEX = ['female', 'male', 'other', 'unknown'] as const;
export type PatientSex = (typeof PATIENT_SEX)[number];

export interface Patient {
  id: string;
  fileNumber: number;
  givenName: string;
  familyName: string;
  /** YYYY-MM-DD */
  birthDate: string;
  sex: string;
  phone: string | null;
  email: string | null;
  /** Masked, showing the last characters only. The full number is never returned. */
  nationalId: string | null;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** One result of GET /v1/patients?q= */
export interface PatientHit {
  id: string;
  fileNumber: number;
  givenName: string;
  familyName: string;
  birthDate: string;
  sex: string;
  phone: string | null;
  status: string;
  /** How well the patient matches, from 0 to 1. */
  score: number;
}

export interface PatientSearchResponse {
  results: PatientHit[];
}

/** A likely existing record, listed by 409 possible_duplicate. */
export interface DuplicateCandidate {
  id: string;
  fileNumber: number;
  givenName: string;
  familyName: string;
  birthDate: string;
}
