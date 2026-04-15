import {
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';

import { patients } from './clinical.js';
import { tenants, users } from './tenancy.js';

export const consents = pgTable(
  'consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    consentType: text('consent_type').notNull(),
    scope: jsonb('scope').$type<Record<string, unknown> | null>(),
    status: text('status').notNull().default('GRANTED'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    source: text('source'),
    documentUri: text('document_uri'),
    recordedById: uuid('recorded_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_consents_subject_type_scope_active').on(
      table.tenantId,
      table.subjectType,
      table.subjectId,
      table.consentType,
      table.status
    ),
    index('idx_consents_subject').on(
      table.tenantId,
      table.subjectType,
      table.subjectId,
      table.consentType
    ),
    index('idx_consents_active').on(
      table.tenantId,
      table.consentType,
      table.status,
      table.expiresAt
    ),
  ]
);

export const phiAccessLogs = pgTable(
  'phi_access_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    patientId: uuid('patient_id').references(() => patients.id),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    accessType: text('access_type').notNull(),
    purposeOfUse: text('purpose_of_use'),
    requestId: text('request_id'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_phi_access_tenant_time').on(table.tenantId, table.occurredAt),
    index('idx_phi_access_patient_time').on(table.tenantId, table.patientId, table.occurredAt),
    index('idx_phi_access_resource').on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
      table.occurredAt
    ),
    index('idx_phi_access_actor').on(
      table.tenantId,
      table.actorType,
      table.actorId,
      table.occurredAt
    ),
  ]
);

export const dataRetentionPolicies = pgTable(
  'data_retention_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    dataClass: text('data_class').notNull(),
    retentionUnit: text('retention_unit').notNull().default('DAYS'),
    retentionValue: integer('retention_value').notNull(),
    archiveAfterValue: integer('archive_after_value'),
    archiveStorageClass: text('archive_storage_class'),
    isActive: boolean('is_active').notNull().default(true),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_retention_policy_tenant_data_class_active').on(
      table.tenantId,
      table.dataClass,
      table.isActive
    ),
    index('idx_retention_tenant_class').on(table.tenantId, table.dataClass, table.isActive),
  ]
);

export const legalHolds = pgTable(
  'legal_holds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    holdName: text('hold_name').notNull(),
    reason: text('reason'),
    status: text('status').notNull().default('ACTIVE'),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedById: uuid('released_by_id').references(() => users.id),
  },
  (table) => [
    index('idx_legal_holds_tenant_status').on(table.tenantId, table.status, table.createdAt),
  ]
);

export const legalHoldLinks = pgTable(
  'legal_hold_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    legalHoldId: uuid('legal_hold_id')
      .notNull()
      .references(() => legalHolds.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    dataClass: text('data_class'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_legal_hold_link').on(
      table.tenantId,
      table.legalHoldId,
      table.entityType,
      table.entityId,
      table.dataClass
    ),
    index('idx_legal_hold_links_lookup').on(table.tenantId, table.entityType, table.entityId),
    index('idx_legal_hold_links_hold').on(table.legalHoldId, table.tenantId),
  ]
);
