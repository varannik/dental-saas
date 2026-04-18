import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface ExternalSystem {
  id: UUID;
  key: string;
  systemType: string;
  name: string;
  vendor: string | null;
  version: string | null;
  docsUrl: string | null;
  authType: string | null;
  status: string;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TenantIntegration {
  id: UUID;
  tenantId: UUID;
  externalSystemId: UUID;
  systemType: string;
  displayName: string;
  status: string;
  syncMode: string;
  config: JsonObject | null;
  lastSyncedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface IntegrationCredential {
  id: UUID;
  tenantIntegrationId: UUID;
  credentialType: string;
  secretRef: string;
  authConfig: JsonObject | null;
  expiresAt: ISODateTime | null;
  status: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SyncJob {
  id: UUID;
  tenantId: UUID;
  tenantIntegrationId: UUID;
  jobType: string;
  direction: string;
  status: string;
  triggeredByUserId: UUID | null;
  payload: JsonObject | null;
  processedCount: number;
  successCount: number;
  failureCount: number;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  errorSummary: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SyncJobLog {
  id: UUID;
  syncJobId: UUID;
  level: string;
  message: string;
  details: JsonObject | null;
  createdAt: ISODateTime;
}

export interface FhirResource {
  id: UUID;
  tenantId: UUID;
  patientId: UUID | null;
  resourceType: string;
  resourceId: string;
  resourceVersion: string | null;
  sourceSystem: string | null;
  payload: JsonObject;
  hash: string | null;
  lastSyncedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface DicomTransaction {
  id: UUID;
  tenantId: UUID;
  imagingStudyId: UUID | null;
  imagingObjectId: UUID | null;
  transactionType: string;
  direction: string;
  status: string;
  sourceSystem: string | null;
  requestPayload: JsonObject | null;
  responsePayload: JsonObject | null;
  receivedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface WebhookSubscription {
  id: UUID;
  tenantId: UUID;
  eventType: string;
  targetUrl: string;
  secretRef: string | null;
  authConfig: JsonObject | null;
  retryPolicy: JsonObject | null;
  isActive: boolean;
  createdByUserId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
