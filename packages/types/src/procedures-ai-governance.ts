import type { ISODateTime, UUID } from './tenancy.js';

export interface Procedure {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  encounterId: UUID;
  providerId: UUID | null;
  cdtCode: string;
  toothNumber: string | null;
  surface: string | null;
  startAt: ISODateTime | null;
  endAt: ISODateTime | null;
  status: string;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProcedureMaterial {
  id: UUID;
  procedureId: UUID;
  materialCode: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  createdAt: ISODateTime;
}

export interface ClinicalOutcome {
  id: UUID;
  tenantId: UUID;
  procedureId: UUID | null;
  encounterId: UUID | null;
  outcomeScore: number | null;
  complications: string | null;
  successFlag: boolean | null;
  notes: string | null;
  createdAt: ISODateTime;
}

export interface ImagingSeries {
  id: UUID;
  studyId: UUID;
  seriesUid: string | null;
  seriesNumber: string | null;
  modality: string | null;
  bodyPart: string | null;
  createdAt: ISODateTime;
}

export interface AIModelDeployment {
  id: UUID;
  tenantId: UUID | null;
  modelVersionId: UUID;
  status: string;
  rolloutStrategy: string | null;
  createdById: UUID | null;
  createdAt: ISODateTime;
}

export interface AIReviewEvent {
  id: UUID;
  predictionId: UUID;
  reviewerId: UUID | null;
  reviewAction: string;
  reasonCode: string | null;
  comment: string | null;
  useForTraining: boolean;
  createdAt: ISODateTime;
}

export interface AIOutcomeLink {
  id: UUID;
  predictionId: UUID;
  encounterId: UUID | null;
  procedureId: UUID | null;
  groundTruthCode: string | null;
  groundTruthSource: string | null;
  evaluationTimestamp: ISODateTime;
  createdAt: ISODateTime;
}
