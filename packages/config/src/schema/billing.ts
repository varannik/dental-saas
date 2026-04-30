import { index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { patients } from './clinical.js';
import { tenants, users } from './tenancy.js';

export const treatmentPlans = pgTable(
  'treatment_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id),
    title: text('title'),
    status: text('status').notNull().default('DRAFT'),
    totalEstimatedCost: numeric('total_estimated_cost', { precision: 12, scale: 2 }),
    estimatedInsuranceCoverage: numeric('estimated_insurance_coverage', {
      precision: 12,
      scale: 2,
    }),
    notes: text('notes'),
    presentedAt: timestamp('presented_at', { withTimezone: true }),
    presentedById: uuid('presented_by_id').references(() => users.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_treatment_plans_tenant_patient').on(
      table.tenantId,
      table.patientId,
      table.createdAt
    ),
    index('idx_treatment_plans_status').on(table.tenantId, table.patientId, table.status),
  ]
);

export const treatmentPlanItems = pgTable(
  'treatment_plan_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => treatmentPlans.id),
    cdtCode: text('cdt_code').notNull(),
    toothNumber: text('tooth_number'),
    surface: text('surface'),
    phase: integer('phase'),
    sequenceOrder: integer('sequence_order'),
    estimatedFee: numeric('estimated_fee', { precision: 12, scale: 2 }),
    estimatedPatientPortion: numeric('estimated_patient_portion', { precision: 12, scale: 2 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_treatment_plan_items_plan').on(table.planId, table.sequenceOrder)]
);

export const claims = pgTable(
  'claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    payerId: uuid('payer_id'),
    claimNumber: text('claim_number'),
    status: text('status').notNull().default('DRAFT'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    totalBilledAmount: numeric('total_billed_amount', { precision: 12, scale: 2 }),
    totalAllowedAmount: numeric('total_allowed_amount', { precision: 12, scale: 2 }),
    totalPaidAmount: numeric('total_paid_amount', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_claims_tenant_patient').on(table.tenantId, table.patientId, table.createdAt),
  ]
);

export const claimLines = pgTable('claim_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  claimId: uuid('claim_id')
    .notNull()
    .references(() => claims.id),
  procedureId: uuid('procedure_id'),
  cdtCode: text('cdt_code').notNull(),
  billedAmount: numeric('billed_amount', { precision: 12, scale: 2 }),
  allowedAmount: numeric('allowed_amount', { precision: 12, scale: 2 }),
  paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }),
  denialReason: text('denial_reason'),
});
