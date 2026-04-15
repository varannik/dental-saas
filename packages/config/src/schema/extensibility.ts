import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants, users } from './tenancy.js';

export const drugReference = pgTable(
  'drug_reference',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    rxnormCode: text('rxnorm_code').notNull(),
    name: text('name').notNull(),
    genericName: text('generic_name'),
    strength: text('strength'),
    form: text('form'),
    route: text('route'),
    isControlled: boolean('is_controlled').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_drug_reference_scope_code').on(table.tenantId, table.rxnormCode),
    index('idx_drug_reference_name').on(table.name, table.isActive),
  ]
);

export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    entityType: text('entity_type').notNull(),
    fieldKey: text('field_key').notNull(),
    label: text('label').notNull(),
    valueType: text('value_type').notNull(),
    isRequired: boolean('is_required').notNull().default(false),
    isIndexed: boolean('is_indexed').notNull().default(false),
    validationRules: jsonb('validation_rules').$type<Record<string, unknown> | null>(),
    defaultValue: jsonb('default_value').$type<Record<string, unknown> | null>(),
    status: text('status').notNull().default('ACTIVE'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_custom_field_definitions_scope').on(
      table.tenantId,
      table.entityType,
      table.fieldKey
    ),
    index('idx_custom_field_definitions_tenant_status').on(
      table.tenantId,
      table.status,
      table.updatedAt
    ),
  ]
);

export const customFieldValues = pgTable(
  'custom_field_values',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => customFieldDefinitions.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    valueJson: jsonb('value_json').$type<Record<string, unknown> | null>(),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { precision: 14, scale: 4 }),
    valueBoolean: boolean('value_boolean'),
    valueDate: date('value_date'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_custom_field_values_entity').on(
      table.definitionId,
      table.entityType,
      table.entityId
    ),
    index('idx_custom_field_values_tenant_entity').on(
      table.tenantId,
      table.entityType,
      table.entityId
    ),
    index('idx_custom_field_values_definition').on(table.definitionId, table.recordedAt),
  ]
);

export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    workflowType: text('workflow_type').notNull().default('OPERATIONAL'),
    version: integer('version').notNull().default(1),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    triggerType: text('trigger_type'),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_workflows_tenant_key_version').on(table.tenantId, table.key, table.version),
    index('idx_workflows_tenant_active').on(table.tenantId, table.isActive, table.updatedAt),
  ]
);

export const workflowInstances = pgTable(
  'workflow_instances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    status: text('status').notNull().default('PENDING'),
    inputPayload: jsonb('input_payload').$type<Record<string, unknown> | null>(),
    context: jsonb('context').$type<Record<string, unknown> | null>(),
    currentStep: text('current_step'),
    startedByUserId: uuid('started_by_user_id').references(() => users.id),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_workflow_instances_tenant_status').on(table.tenantId, table.status, table.createdAt),
    index('idx_workflow_instances_workflow').on(table.workflowId, table.createdAt),
    index('idx_workflow_instances_entity').on(table.entityType, table.entityId, table.createdAt),
  ]
);
