import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { patients } from './clinical.js';
import { imagingObjects, imagingStudies } from './imaging.js';
import { tenants, users } from './tenancy.js';

export const externalSystems = pgTable(
  'external_systems',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    systemType: text('system_type').notNull(),
    name: text('name').notNull(),
    vendor: text('vendor'),
    version: text('version'),
    docsUrl: text('docs_url'),
    authType: text('auth_type'),
    status: text('status').notNull().default('ACTIVE'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('external_systems_key_unique').on(table.key),
    index('idx_external_systems_type_status').on(table.systemType, table.status),
  ]
);

export const tenantIntegrations = pgTable(
  'tenant_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    externalSystemId: uuid('external_system_id')
      .notNull()
      .references(() => externalSystems.id),
    systemType: text('system_type').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    syncMode: text('sync_mode').notNull().default('UNIDIRECTIONAL'),
    config: jsonb('config').$type<Record<string, unknown> | null>(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tenant_integrations_scope').on(
      table.tenantId,
      table.externalSystemId,
      table.displayName
    ),
    index('idx_tenant_integrations_tenant_status').on(table.tenantId, table.status),
  ]
);

export const integrationCredentials = pgTable(
  'integration_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantIntegrationId: uuid('tenant_integration_id')
      .notNull()
      .references(() => tenantIntegrations.id),
    credentialType: text('credential_type').notNull(),
    secretRef: text('secret_ref').notNull(),
    authConfig: jsonb('auth_config').$type<Record<string, unknown> | null>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_integration_credentials_integration').on(table.tenantIntegrationId, table.status),
    uniqueIndex('uq_integration_credentials_ref').on(
      table.tenantIntegrationId,
      table.credentialType,
      table.secretRef
    ),
  ]
);

export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tenantIntegrationId: uuid('tenant_integration_id')
      .notNull()
      .references(() => tenantIntegrations.id),
    jobType: text('job_type').notNull(),
    direction: text('direction').notNull().default('IMPORT'),
    status: text('status').notNull().default('QUEUED'),
    triggeredByUserId: uuid('triggered_by_user_id').references(() => users.id),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    processedCount: integer('processed_count').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorSummary: text('error_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_sync_jobs_tenant_status').on(table.tenantId, table.status, table.createdAt),
    index('idx_sync_jobs_integration').on(table.tenantIntegrationId, table.createdAt),
  ]
);

export const syncJobLogs = pgTable(
  'sync_job_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    syncJobId: uuid('sync_job_id')
      .notNull()
      .references(() => syncJobs.id),
    level: text('level').notNull().default('INFO'),
    message: text('message').notNull(),
    details: jsonb('details').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sync_job_logs_job_time').on(table.syncJobId, table.createdAt)]
);

export const fhirResources = pgTable(
  'fhir_resources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id').references(() => patients.id),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    resourceVersion: text('resource_version'),
    sourceSystem: text('source_system'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    hash: text('hash'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fhir_resources_tenant_type').on(table.tenantId, table.resourceType, table.createdAt),
    uniqueIndex('uq_fhir_resources_identity').on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
      table.resourceVersion
    ),
  ]
);

export const dicomTransactions = pgTable(
  'dicom_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    imagingStudyId: uuid('imaging_study_id').references(() => imagingStudies.id),
    imagingObjectId: uuid('imaging_object_id').references(() => imagingObjects.id),
    transactionType: text('transaction_type').notNull(),
    direction: text('direction').notNull().default('OUTBOUND'),
    status: text('status').notNull().default('QUEUED'),
    sourceSystem: text('source_system'),
    requestPayload: jsonb('request_payload').$type<Record<string, unknown> | null>(),
    responsePayload: jsonb('response_payload').$type<Record<string, unknown> | null>(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_dicom_transactions_tenant_status').on(table.tenantId, table.status, table.createdAt),
    index('idx_dicom_transactions_study').on(table.imagingStudyId),
  ]
);

export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: text('event_type').notNull(),
    targetUrl: text('target_url').notNull(),
    secretRef: text('secret_ref'),
    authConfig: jsonb('auth_config').$type<Record<string, unknown> | null>(),
    retryPolicy: jsonb('retry_policy').$type<Record<string, unknown> | null>(),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_webhook_subscriptions_tenant_active').on(table.tenantId, table.isActive),
    uniqueIndex('uq_webhook_subscriptions_target').on(
      table.tenantId,
      table.eventType,
      table.targetUrl
    ),
  ]
);
