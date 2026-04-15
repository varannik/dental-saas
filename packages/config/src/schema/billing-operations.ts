import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { claims } from './billing.js';
import { tenants, users } from './tenancy.js';

export const billingPlans = pgTable(
  'billing_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    billingCycle: text('billing_cycle').notNull().default('MONTHLY'),
    currency: text('currency').notNull().default('USD'),
    basePrice: numeric('base_price', { precision: 12, scale: 2 }).notNull(),
    includedSeats: numeric('included_seats', { precision: 12, scale: 2 }),
    includedAiCalls: numeric('included_ai_calls', { precision: 14, scale: 2 }),
    includedStorageGb: numeric('included_storage_gb', { precision: 14, scale: 2 }),
    overagePolicy: jsonb('overage_policy').$type<Record<string, unknown> | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('billing_plans_code_unique').on(table.code),
    index('idx_billing_plans_active').on(table.isActive),
  ]
);

export const tenantBillingAccounts = pgTable(
  'tenant_billing_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingPlanId: uuid('billing_plan_id')
      .notNull()
      .references(() => billingPlans.id),
    status: text('status').notNull().default('ACTIVE'),
    billingEmail: text('billing_email'),
    billingAddress: jsonb('billing_address').$type<Record<string, unknown> | null>(),
    paymentProvider: text('payment_provider'),
    paymentCustomerRef: text('payment_customer_ref'),
    paymentMethodRef: text('payment_method_ref'),
    taxId: text('tax_id'),
    nextBillingDate: date('next_billing_date'),
    autoPay: boolean('auto_pay').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tenant_billing_accounts_tenant_unique').on(table.tenantId),
    index('idx_tenant_billing_accounts_status').on(table.status),
  ]
);

export const usageMeters = pgTable(
  'usage_meters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    meterKey: text('meter_key').notNull(),
    unit: text('unit').notNull(),
    aggregationType: text('aggregation_type').notNull().default('SUM'),
    resetPeriod: text('reset_period').notNull().default('MONTHLY'),
    isBillable: boolean('is_billable').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_usage_meters_scope_key').on(table.tenantId, table.meterKey),
    index('idx_usage_meters_active').on(table.tenantId, table.isActive),
  ]
);

export const usageMeterReadings = pgTable(
  'usage_meter_readings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    usageMeterId: uuid('usage_meter_id')
      .notNull()
      .references(() => usageMeters.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    readingValue: numeric('reading_value', { precision: 14, scale: 4 }).notNull(),
    source: text('source'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_usage_meter_readings_period').on(
      table.usageMeterId,
      table.periodStart,
      table.periodEnd
    ),
    index('idx_usage_meter_readings_tenant_meter').on(
      table.tenantId,
      table.usageMeterId,
      table.periodStart
    ),
  ]
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tenantBillingAccountId: uuid('tenant_billing_account_id')
      .notNull()
      .references(() => tenantBillingAccounts.id),
    invoiceNumber: text('invoice_number'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status').notNull().default('DRAFT'),
    currency: text('currency').notNull().default('USD'),
    subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    outstandingAmount: numeric('outstanding_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_invoices_tenant_number').on(table.tenantId, table.invoiceNumber),
    index('idx_invoices_tenant_status').on(table.tenantId, table.status, table.createdAt),
    index('idx_invoices_billing_account').on(table.tenantBillingAccountId, table.createdAt),
  ]
);

export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    usageMeterReadingId: uuid('usage_meter_reading_id').references(() => usageMeterReadings.id),
    lineType: text('line_type').notNull().default('SUBSCRIPTION'),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 4 }).notNull().default('1'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('USD'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_invoice_line_items_invoice').on(table.invoiceId),
    index('idx_invoice_line_items_usage_reading').on(table.usageMeterReadingId),
  ]
);

export const claimStatusEvents = pgTable(
  'claim_status_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    statusCode: text('status_code'),
    payerMessage: text('payer_message'),
    eventAt: timestamp('event_at', { withTimezone: true }).notNull().defaultNow(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown> | null>(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_claim_status_events_claim_time').on(table.claimId, table.eventAt),
    index('idx_claim_status_events_tenant_to_status').on(
      table.tenantId,
      table.toStatus,
      table.createdAt
    ),
  ]
);
