import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  bigint,
  boolean,
} from 'drizzle-orm/pg-core';

import { encounters, patients } from './clinical.js';
import { tenants, users } from './tenancy.js';

export const imagingStudies = pgTable(
  'imaging_studies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    studyUid: text('study_uid'),
    modality: text('modality').notNull(),
    bodyPart: text('body_part'),
    acquisitionDatetime: timestamp('acquisition_datetime', { withTimezone: true }),
    sourceSystem: text('source_system'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_imaging_studies_tenant_patient').on(
      table.tenantId,
      table.patientId,
      table.acquisitionDatetime
    ),
  ]
);

export const imagingObjects = pgTable(
  'imaging_objects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: uuid('study_id')
      .notNull()
      .references(() => imagingStudies.id),
    seriesId: uuid('series_id'),
    sopInstanceUid: text('sop_instance_uid'),
    objectType: text('object_type').notNull(),
    storageUri: text('storage_uri').notNull(),
    hash: text('hash'),
    byteSize: bigint('byte_size', { mode: 'number' }),
    width: integer('width'),
    height: integer('height'),
    depthSlices: integer('depth_slices'),
    isOriginal: boolean('is_original').notNull().default(true),
    processingPipeline: jsonb('processing_pipeline').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_imaging_objects_study').on(table.studyId)]
);

export const imageAnnotations = pgTable(
  'image_annotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    imagingObjectId: uuid('imaging_object_id')
      .notNull()
      .references(() => imagingObjects.id),
    annotationType: text('annotation_type').notNull(),
    annotationData: jsonb('annotation_data').$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_image_annotations_object').on(table.imagingObjectId)]
);

export const aiModels = pgTable('ai_models', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  vendor: text('vendor').notNull(),
  regulatoryClass: text('regulatory_class').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiModelVersions = pgTable(
  'ai_model_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => aiModels.id),
    versionTag: text('version_tag').notNull(),
    artifactUri: text('artifact_uri').notNull(),
    inputTypes: jsonb('input_types').$type<string[]>().notNull(),
    outputTypes: jsonb('output_types').$type<string[]>().notNull(),
    performanceMetrics: jsonb('performance_metrics').$type<Record<string, unknown> | null>(),
    validatedOn: timestamp('validated_on', { withTimezone: true }),
    validationSummaryUri: text('validation_summary_uri'),
    sbomUri: text('sbom_uri'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_ai_model_versions_model_version').on(table.modelId, table.versionTag)]
);

export const aiInferenceJobs = pgTable(
  'ai_inference_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    modelVersionId: uuid('model_version_id')
      .notNull()
      .references(() => aiModelVersions.id),
    inputType: text('input_type').notNull(),
    inputRefId: uuid('input_ref_id').notNull(),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
    status: text('status').notNull().default('QUEUED'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    computeEnv: jsonb('compute_env').$type<Record<string, unknown> | null>(),
    errorDetails: text('error_details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_jobs_tenant_model_status').on(
      table.tenantId,
      table.modelVersionId,
      table.status,
      table.createdAt
    ),
  ]
);

export const aiPredictions = pgTable(
  'ai_predictions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => aiInferenceJobs.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id').references(() => patients.id),
    imagingObjectId: uuid('imaging_object_id').references(() => imagingObjects.id),
    predictionType: text('prediction_type').notNull(),
    code: text('code'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    severity: text('severity'),
    roiAnnotationId: uuid('roi_annotation_id').references(() => imageAnnotations.id),
    rawOutput: jsonb('raw_output').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_predictions_tenant_patient').on(table.tenantId, table.patientId, table.createdAt),
  ]
);
