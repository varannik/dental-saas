import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { encounters, patients } from './clinical.js';
import { tenants, users } from './tenancy.js';

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    category: text('category'),
    audience: text('audience'),
    status: text('status').notNull().default('DRAFT'),
    currentVersionId: uuid('current_version_id'),
    tags: jsonb('tags').$type<string[] | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_knowledge_documents_tenant_slug').on(table.tenantId, table.slug),
    index('idx_knowledge_documents_tenant_status').on(
      table.tenantId,
      table.status,
      table.updatedAt
    ),
  ]
);

export const knowledgeVersions = pgTable(
  'knowledge_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    knowledgeDocumentId: uuid('knowledge_document_id')
      .notNull()
      .references(() => knowledgeDocuments.id),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    contentFormat: text('content_format').notNull().default('MARKDOWN'),
    changeSummary: text('change_summary'),
    status: text('status').notNull().default('DRAFT'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    isImmutable: boolean('is_immutable').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_knowledge_versions_doc_number').on(
      table.knowledgeDocumentId,
      table.versionNumber
    ),
    index('idx_knowledge_versions_tenant_status').on(table.tenantId, table.status, table.createdAt),
  ]
);

export const knowledgeLocalizations = pgTable(
  'knowledge_localizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    knowledgeVersionId: uuid('knowledge_version_id')
      .notNull()
      .references(() => knowledgeVersions.id),
    locale: text('locale').notNull(),
    localizedTitle: text('localized_title'),
    localizedContent: text('localized_content').notNull(),
    region: text('region'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_knowledge_localizations_version_locale').on(
      table.knowledgeVersionId,
      table.locale
    ),
    index('idx_knowledge_localizations_tenant_locale').on(
      table.tenantId,
      table.locale,
      table.updatedAt
    ),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    conversationType: text('conversation_type').notNull().default('TEAM'),
    subject: text('subject'),
    status: text('status').notNull().default('OPEN'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_conversations_tenant_status').on(table.tenantId, table.status, table.updatedAt),
    index('idx_conversations_tenant_type').on(
      table.tenantId,
      table.conversationType,
      table.createdAt
    ),
  ]
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    participantType: text('participant_type').notNull(),
    userId: uuid('user_id').references(() => users.id),
    patientId: uuid('patient_id').references(() => patients.id),
    role: text('role').notNull().default('PARTICIPANT'),
    isMuted: boolean('is_muted').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index('idx_conversation_participants_conversation').on(table.conversationId, table.role),
    index('idx_conversation_participants_user').on(table.userId, table.conversationId),
    index('idx_conversation_participants_patient').on(table.patientId, table.conversationId),
  ]
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    senderType: text('sender_type').notNull(),
    senderUserId: uuid('sender_user_id').references(() => users.id),
    senderPatientId: uuid('sender_patient_id').references(() => patients.id),
    contentType: text('content_type').notNull().default('TEXT'),
    content: text('content').notNull(),
    deliveryState: text('delivery_state').notNull().default('SENT'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_messages_conversation_sent').on(table.conversationId, table.sentAt),
    index('idx_messages_tenant_sender').on(table.tenantId, table.senderType, table.sentAt),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    recipientType: text('recipient_type').notNull(),
    recipientUserId: uuid('recipient_user_id').references(() => users.id),
    recipientPatientId: uuid('recipient_patient_id').references(() => patients.id),
    channel: text('channel').notNull().default('IN_APP'),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    status: text('status').notNull().default('PENDING'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_notifications_tenant_status').on(table.tenantId, table.status, table.createdAt),
    index('idx_notifications_user_unread').on(table.recipientUserId, table.readAt, table.createdAt),
    index('idx_notifications_patient_unread').on(
      table.recipientPatientId,
      table.readAt,
      table.createdAt
    ),
  ]
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ownerType: text('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    documentType: text('document_type').notNull(),
    title: text('title'),
    fileName: text('file_name'),
    mimeType: text('mime_type'),
    storageUri: text('storage_uri').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    hash: text('hash'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signerId: uuid('signer_id').references(() => users.id),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_documents_tenant_owner').on(table.tenantId, table.ownerType, table.ownerId),
    index('idx_documents_tenant_type').on(table.tenantId, table.documentType, table.createdAt),
  ]
);

export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    fromTenantId: uuid('from_tenant_id').references(() => tenants.id),
    toTenantId: uuid('to_tenant_id').references(() => tenants.id),
    referredByUserId: uuid('referred_by_user_id').references(() => users.id),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    referralType: text('referral_type').notNull().default('EXTERNAL'),
    priority: text('priority').notNull().default('ROUTINE'),
    status: text('status').notNull().default('DRAFT'),
    reason: text('reason'),
    notes: text('notes'),
    referredAt: timestamp('referred_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_referrals_tenant_status').on(table.tenantId, table.status, table.createdAt),
    index('idx_referrals_patient_status').on(table.patientId, table.status, table.createdAt),
    index('idx_referrals_target_tenant').on(table.toTenantId, table.status, table.createdAt),
  ]
);
