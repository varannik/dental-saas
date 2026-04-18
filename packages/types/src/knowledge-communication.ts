import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface KnowledgeDocument {
  id: UUID;
  tenantId: UUID;
  slug: string;
  title: string;
  category: string | null;
  audience: string | null;
  status: string;
  currentVersionId: UUID | null;
  tags: string[] | null;
  metadata: JsonObject | null;
  createdByUserId: UUID | null;
  updatedByUserId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface KnowledgeVersion {
  id: UUID;
  tenantId: UUID;
  knowledgeDocumentId: UUID;
  versionNumber: number;
  title: string;
  content: string;
  contentFormat: string;
  changeSummary: string | null;
  status: string;
  approvedByUserId: UUID | null;
  approvedAt: ISODateTime | null;
  isImmutable: boolean;
  metadata: JsonObject | null;
  createdByUserId: UUID | null;
  createdAt: ISODateTime;
}

export interface KnowledgeLocalization {
  id: UUID;
  tenantId: UUID;
  knowledgeVersionId: UUID;
  locale: string;
  localizedTitle: string | null;
  localizedContent: string;
  region: string | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Conversation {
  id: UUID;
  tenantId: UUID;
  conversationType: string;
  subject: string | null;
  status: string;
  createdByUserId: UUID | null;
  closedAt: ISODateTime | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ConversationParticipant {
  id: UUID;
  conversationId: UUID;
  participantType: string;
  userId: UUID | null;
  patientId: UUID | null;
  role: string;
  isMuted: boolean;
  joinedAt: ISODateTime;
  leftAt: ISODateTime | null;
  lastReadAt: ISODateTime | null;
  metadata: JsonObject | null;
}

export interface Message {
  id: UUID;
  tenantId: UUID;
  conversationId: UUID;
  senderType: string;
  senderUserId: UUID | null;
  senderPatientId: UUID | null;
  contentType: string;
  content: string;
  deliveryState: string;
  sentAt: ISODateTime;
  editedAt: ISODateTime | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
}

export interface Notification {
  id: UUID;
  tenantId: UUID;
  recipientType: string;
  recipientUserId: UUID | null;
  recipientPatientId: UUID | null;
  channel: string;
  eventType: string;
  title: string;
  body: string | null;
  payload: JsonObject | null;
  status: string;
  sentAt: ISODateTime | null;
  deliveredAt: ISODateTime | null;
  readAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface Document {
  id: UUID;
  tenantId: UUID;
  ownerType: string;
  ownerId: UUID;
  documentType: string;
  title: string | null;
  fileName: string | null;
  mimeType: string | null;
  storageUri: string;
  fileSizeBytes: number | null;
  hash: string | null;
  signedAt: ISODateTime | null;
  signerId: UUID | null;
  uploadedByUserId: UUID | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Referral {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  encounterId: UUID | null;
  fromTenantId: UUID | null;
  toTenantId: UUID | null;
  referredByUserId: UUID | null;
  assignedToUserId: UUID | null;
  referralType: string;
  priority: string;
  status: string;
  reason: string | null;
  notes: string | null;
  referredAt: ISODateTime | null;
  acceptedAt: ISODateTime | null;
  closedAt: ISODateTime | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
