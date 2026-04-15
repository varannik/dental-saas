import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core';

import { encounters, patients } from './clinical.js';
import { codeValues } from './reference.js';
import { tenants, users } from './tenancy.js';

export const patientIdentifiers = pgTable(
  'patient_identifiers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    system: text('system').notNull(),
    value: text('value').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_patient_identifiers_patient_system_value').on(
      table.patientId,
      table.system,
      table.value
    ),
    index('idx_patient_identifiers_tenant_patient').on(table.tenantId, table.patientId),
  ]
);

export const patientAddresses = pgTable(
  'patient_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    type: text('type').notNull().default('HOME'),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    isPrimary: boolean('is_primary').notNull().default(false),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_patient_addresses_tenant_patient').on(table.tenantId, table.patientId)]
);

export const patientInsurancePolicies = pgTable(
  'patient_insurance_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    payerName: text('payer_name').notNull(),
    planName: text('plan_name'),
    policyNumber: text('policy_number').notNull(),
    groupNumber: text('group_number'),
    memberId: text('member_id'),
    coverageStart: date('coverage_start'),
    coverageEnd: date('coverage_end'),
    isPrimary: boolean('is_primary').notNull().default(true),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_patient_insurance_tenant_patient').on(table.tenantId, table.patientId),
    index('idx_patient_insurance_policy').on(table.policyNumber),
  ]
);

export const patientRelationships = pgTable(
  'patient_relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    relatedPatientId: uuid('related_patient_id').references(() => patients.id),
    externalContactName: text('external_contact_name'),
    relationshipType: text('relationship_type').notNull(),
    isEmergencyContact: boolean('is_emergency_contact').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_patient_relationships_patient').on(table.tenantId, table.patientId),
    index('idx_patient_relationships_related').on(table.relatedPatientId),
  ]
);

export const patientConditions = pgTable(
  'patient_conditions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    codeValueId: uuid('code_value_id').references(() => codeValues.id),
    conditionCode: text('condition_code'),
    onsetDate: date('onset_date'),
    resolvedDate: date('resolved_date'),
    status: text('status').notNull().default('ACTIVE'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_patient_conditions_tenant_patient').on(
      table.tenantId,
      table.patientId,
      table.status
    ),
  ]
);

export const patientMedications = pgTable(
  'patient_medications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    medicationName: text('medication_name').notNull(),
    dosage: text('dosage'),
    frequency: text('frequency'),
    route: text('route'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    prescribedById: uuid('prescribed_by_id').references(() => users.id),
    source: text('source').notNull().default('PATIENT_REPORTED'),
    status: text('status').notNull().default('ACTIVE'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_patient_medications_tenant_patient').on(
      table.tenantId,
      table.patientId,
      table.status
    ),
  ]
);

export const patientAllergies = pgTable(
  'patient_allergies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    substance: text('substance').notNull(),
    reaction: text('reaction'),
    severity: text('severity'),
    status: text('status').notNull().default('ACTIVE'),
    identifiedAt: timestamp('identified_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_patient_allergies_tenant_patient').on(table.tenantId, table.patientId, table.status),
  ]
);

export const patientSocialHistory = pgTable(
  'patient_social_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    historyType: text('history_type').notNull(),
    valueText: text('value_text'),
    valueJson: jsonb('value_json').$type<Record<string, unknown> | null>(),
    observedAt: timestamp('observed_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_patient_social_history_tenant_patient').on(
      table.tenantId,
      table.patientId,
      table.historyType
    ),
  ]
);

export const encounterDiagnoses = pgTable(
  'encounter_diagnoses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    codeValueId: uuid('code_value_id').references(() => codeValues.id),
    diagnosisCode: text('diagnosis_code'),
    diagnosisType: text('diagnosis_type'),
    sequence: integer('sequence').notNull().default(1),
    isPrimary: boolean('is_primary').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_encounter_diagnoses_encounter_sequence').on(table.encounterId, table.sequence),
    index('idx_encounter_diagnoses_tenant_encounter').on(table.tenantId, table.encounterId),
  ]
);

export const vitalSigns = pgTable(
  'vital_signs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    recordedById: uuid('recorded_by_id').references(() => users.id),
    systolicBp: integer('systolic_bp'),
    diastolicBp: integer('diastolic_bp'),
    heartRate: integer('heart_rate'),
    respiratoryRate: integer('respiratory_rate'),
    temperatureC: numeric('temperature_c', { precision: 4, scale: 1 }),
    spo2: integer('spo2'),
    heightCm: numeric('height_cm', { precision: 5, scale: 2 }),
    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
    bmi: numeric('bmi', { precision: 5, scale: 2 }),
    painScore: integer('pain_score'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_vital_signs_tenant_patient_time').on(
      table.tenantId,
      table.patientId,
      table.recordedAt
    ),
    index('idx_vital_signs_encounter').on(table.encounterId),
  ]
);
