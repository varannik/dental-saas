import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface Consent {
  id: UUID;
  tenantId: UUID;
  subjectType: string;
  subjectId: UUID;
  consentType: string;
  scope: JsonObject | null;
  status: string;
  grantedAt: ISODateTime;
  revokedAt: ISODateTime | null;
  expiresAt: ISODateTime | null;
  source: string | null;
  documentUri: string | null;
  recordedById: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PHIAccessLog {
  id: UUID;
  tenantId: UUID;
  actorType: string;
  actorId: UUID | null;
  patientId: UUID | null;
  resourceType: string;
  resourceId: UUID;
  accessType: string;
  purposeOfUse: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: JsonObject | null;
  occurredAt: ISODateTime;
}

export interface DataRetentionPolicy {
  id: UUID;
  tenantId: UUID;
  dataClass: string;
  retentionUnit: string;
  retentionValue: number;
  archiveAfterValue: number | null;
  archiveStorageClass: string | null;
  isActive: boolean;
  createdById: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface LegalHold {
  id: UUID;
  tenantId: UUID;
  holdName: string;
  reason: string | null;
  status: string;
  createdById: UUID | null;
  createdAt: ISODateTime;
  releasedAt: ISODateTime | null;
  releasedById: UUID | null;
}

export interface LegalHoldLink {
  id: UUID;
  tenantId: UUID;
  legalHoldId: UUID;
  entityType: string;
  entityId: UUID | null;
  dataClass: string | null;
  createdAt: ISODateTime;
}
