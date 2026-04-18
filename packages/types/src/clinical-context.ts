import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface PatientIdentifier {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  system: string;
  value: string;
  isPrimary: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PatientAddress {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  type: string;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  isPrimary: boolean;
  status: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PatientInsurancePolicy {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  payerName: string;
  planName: string | null;
  policyNumber: string;
  groupNumber: string | null;
  memberId: string | null;
  coverageStart: ISODateTime | null;
  coverageEnd: ISODateTime | null;
  isPrimary: boolean;
  status: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PatientRelationship {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  relatedPatientId: UUID | null;
  externalContactName: string | null;
  relationshipType: string;
  isEmergencyContact: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PatientCondition {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  codeValueId: UUID | null;
  conditionCode: string | null;
  onsetDate: ISODateTime | null;
  resolvedDate: ISODateTime | null;
  status: string;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PatientMedication {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  medicationName: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  startDate: ISODateTime | null;
  endDate: ISODateTime | null;
  prescribedById: UUID | null;
  source: string;
  status: string;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PatientAllergy {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  substance: string;
  reaction: string | null;
  severity: string | null;
  status: string;
  identifiedAt: ISODateTime | null;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PatientSocialHistory {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  historyType: string;
  valueText: string | null;
  valueJson: JsonObject | null;
  observedAt: ISODateTime | null;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EncounterDiagnosis {
  id: UUID;
  tenantId: UUID;
  encounterId: UUID;
  patientId: UUID;
  codeValueId: UUID | null;
  diagnosisCode: string | null;
  diagnosisType: string | null;
  sequence: number;
  isPrimary: boolean;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface VitalSign {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  encounterId: UUID | null;
  recordedAt: ISODateTime;
  recordedById: UUID | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  temperatureC: number | null;
  spo2: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  painScore: number | null;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
