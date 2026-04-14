import type { ISODateTime, UUID } from './tenancy';

export const TREATMENT_PLAN_STATUSES = [
  'DRAFT',
  'PRESENTED',
  'ACCEPTED',
  'DECLINED',
  'PARTIALLY_ACCEPTED',
  'COMPLETED',
] as const;
export type TreatmentPlanStatus = (typeof TREATMENT_PLAN_STATUSES)[number];

export const CLAIM_STATUSES = [
  'DRAFT',
  'READY',
  'SUBMITTED',
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'DENIED',
  'VOIDED',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface TreatmentPlan {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  createdById: UUID;
  status: TreatmentPlanStatus;
  totalEstimatedCost: number | null;
  estimatedInsuranceCoverage: number | null;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TreatmentPlanItem {
  id: UUID;
  planId: UUID;
  cdtCode: string;
  toothNumber: string | null;
  surface: string | null;
  phase: number | null;
  sequenceOrder: number | null;
  estimatedFee: number | null;
  estimatedPatientPortion: number | null;
}

export interface Claim {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  payerId: UUID | null;
  claimNumber: string | null;
  status: ClaimStatus;
  submittedAt: ISODateTime | null;
  totalBilledAmount: number | null;
  totalAllowedAmount: number | null;
  totalPaidAmount: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ClaimLine {
  id: UUID;
  claimId: UUID;
  procedureId: UUID | null;
  cdtCode: string;
  billedAmount: number | null;
  allowedAmount: number | null;
  paidAmount: number | null;
  denialReason: string | null;
}
