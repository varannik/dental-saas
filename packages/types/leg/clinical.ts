import type { ISODateTime, UUID } from '../src/tenancy.js';

export const PATIENT_STATUSES = ['ACTIVE', 'INACTIVE', 'DECEASED'] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export const ENCOUNTER_TYPES = [
  'EXAM',
  'EMERGENCY',
  'HYGIENE',
  'ORTHO',
  'IMPLANT',
  'TEACHING',
] as const;
export type EncounterType = (typeof ENCOUNTER_TYPES)[number];

export const ENCOUNTER_STATUSES = [
  'SCHEDULED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

export interface Patient {
  id: UUID;
  tenantId: UUID;
  primaryLocationId: UUID | null;
  firstName: string;
  lastName: string;
  dob: string | null;
  sexAtBirth: string | null;
  genderIdentity: string | null;
  contactEmail: string | null;
  phoneMobile: string | null;
  phoneHome: string | null;
  preferredLocale: string | null;
  preferredLanguage: string | null;
  preferredContactMethod: string | null;
  status: PatientStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Encounter {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  locationId: UUID;
  providerId: UUID | null;
  encounterType: EncounterType;
  status: EncounterStatus;
  scheduledStartAt: ISODateTime | null;
  checkInAt: ISODateTime | null;
  checkOutAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Practical domain shape used by services that generate encounter notes.
 * The schema stores notes in related clinical tables.
 */
export interface ClinicalNote {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  encounterId: UUID | null;
  authoredById: UUID | null;
  noteType: string;
  content: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
