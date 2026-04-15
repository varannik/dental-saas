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

import { tenants } from './tenancy.js';

export const codeSystems = pgTable(
  'code_systems',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    systemKey: text('system_key').notNull(),
    name: text('name').notNull(),
    version: text('version'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_code_systems_scope_key_version').on(
      table.tenantId,
      table.systemKey,
      table.version
    ),
    index('idx_code_systems_active').on(table.tenantId, table.systemKey, table.isActive),
  ]
);

export const codeValues = pgTable(
  'code_values',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    systemId: uuid('system_id')
      .notNull()
      .references(() => codeSystems.id),
    code: text('code').notNull(),
    display: text('display').notNull(),
    description: text('description'),
    category: text('category'),
    isBillable: boolean('is_billable').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_code_values_scope_system_code').on(table.tenantId, table.systemId, table.code),
    index('idx_code_values_lookup').on(table.tenantId, table.systemId, table.code, table.isActive),
    index('idx_code_values_category').on(table.tenantId, table.category, table.isActive),
    index('idx_code_values_display_search').on(table.systemId, table.display),
  ]
);

export const procedureCatalog = pgTable(
  'procedure_catalog',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    codeValueId: uuid('code_value_id')
      .notNull()
      .references(() => codeValues.id),
    procedureType: text('procedure_type'),
    defaultDurationMin: integer('default_duration_min'),
    requiresTooth: boolean('requires_tooth').notNull().default(false),
    requiresSurface: boolean('requires_surface').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_procedure_catalog_scope_code').on(table.tenantId, table.codeValueId),
    index('idx_procedure_catalog_active').on(table.tenantId, table.isActive),
    index('idx_procedure_catalog_code').on(table.codeValueId),
  ]
);

export const feeSchedules = pgTable(
  'fee_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    scopeType: text('scope_type').notNull().default('TENANT'),
    scopeId: uuid('scope_id'),
    currency: text('currency').notNull().default('USD'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fee_schedules_scope_name_effective').on(
      table.tenantId,
      table.scopeType,
      table.scopeId,
      table.name,
      table.effectiveFrom
    ),
    index('idx_fee_schedules_active').on(table.tenantId, table.isActive, table.effectiveFrom),
  ]
);

export const feeScheduleItems = pgTable(
  'fee_schedule_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    feeScheduleId: uuid('fee_schedule_id')
      .notNull()
      .references(() => feeSchedules.id),
    procedureCatalogId: uuid('procedure_catalog_id')
      .notNull()
      .references(() => procedureCatalog.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    minAmount: numeric('min_amount', { precision: 12, scale: 2 }),
    maxAmount: numeric('max_amount', { precision: 12, scale: 2 }),
    unit: text('unit').notNull().default('EACH'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fee_schedule_items_unique').on(table.feeScheduleId, table.procedureCatalogId),
    index('idx_fee_schedule_items_schedule').on(table.feeScheduleId),
    index('idx_fee_schedule_items_procedure').on(table.procedureCatalogId),
  ]
);
