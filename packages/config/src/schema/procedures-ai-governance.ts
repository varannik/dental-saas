import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { encounters, patients } from './clinical.js';
import { aiModelVersions, aiPredictions, imagingStudies } from './imaging.js';
import { tenants, users } from './tenancy.js';

export const procedures = pgTable(
  'procedures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id),
    providerId: uuid('provider_id').references(() => users.id),
    cdtCode: text('cdt_code').notNull(),
    toothNumber: text('tooth_number'),
    surface: text('surface'),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    status: text('status').notNull().default('PLANNED'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_procedures_tenant_patient').on(table.tenantId, table.patientId, table.createdAt),
    index('idx_procedures_encounter').on(table.encounterId),
  ]
);

export const procedureMaterials = pgTable(
  'procedure_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    procedureId: uuid('procedure_id')
      .notNull()
      .references(() => procedures.id),
    materialCode: text('material_code').notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 2 }),
    unit: text('unit'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_procedure_materials_procedure').on(table.procedureId)]
);

export const clinicalOutcomes = pgTable(
  'clinical_outcomes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    procedureId: uuid('procedure_id').references(() => procedures.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    outcomeScore: numeric('outcome_score', { precision: 5, scale: 2 }),
    complications: text('complications'),
    successFlag: boolean('success_flag'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_clinical_outcomes_tenant_time').on(table.tenantId, table.createdAt)]
);

export const imagingSeries = pgTable(
  'imaging_series',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: uuid('study_id')
      .notNull()
      .references(() => imagingStudies.id),
    seriesUid: text('series_uid'),
    seriesNumber: text('series_number'),
    modality: text('modality'),
    bodyPart: text('body_part'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_imaging_series_study').on(table.studyId)]
);

export const aiModelDeployments = pgTable(
  'ai_model_deployments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    modelVersionId: uuid('model_version_id')
      .notNull()
      .references(() => aiModelVersions.id),
    status: text('status').notNull().default('ROLLED_OUT'),
    rolloutStrategy: text('rollout_strategy'),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_model_deployments_tenant_status').on(
      table.tenantId,
      table.status,
      table.createdAt
    ),
  ]
);

export const aiReviewEvents = pgTable(
  'ai_review_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    predictionId: uuid('prediction_id')
      .notNull()
      .references(() => aiPredictions.id),
    reviewerId: uuid('reviewer_id').references(() => users.id),
    reviewAction: text('review_action').notNull(),
    reasonCode: text('reason_code'),
    comment: text('comment'),
    useForTraining: boolean('use_for_training').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_ai_review_events_prediction').on(table.predictionId, table.createdAt)]
);

export const aiOutcomeLinks = pgTable(
  'ai_outcome_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    predictionId: uuid('prediction_id')
      .notNull()
      .references(() => aiPredictions.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    procedureId: uuid('procedure_id').references(() => procedures.id),
    groundTruthCode: text('ground_truth_code'),
    groundTruthSource: text('ground_truth_source'),
    evaluationTimestamp: timestamp('evaluation_timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_outcome_links_prediction').on(table.predictionId, table.evaluationTimestamp),
  ]
);
