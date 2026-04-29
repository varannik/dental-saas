import { sql } from 'drizzle-orm';
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
  date,
} from 'drizzle-orm/pg-core';

import { locations, tenants, users } from './tenancy.js';

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    primaryLocationId: uuid('primary_location_id').references(() => locations.id),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dob: date('dob'),
    sexAtBirth: text('sex_at_birth'),
    genderIdentity: text('gender_identity'),
    contactEmail: text('contact_email'),
    phoneMobile: text('phone_mobile'),
    phoneHome: text('phone_home'),
    preferredLocale: text('preferred_locale'),
    preferredLanguage: text('preferred_language'),
    preferredContactMethod: text('preferred_contact_method'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_patients_tenant_name_dob').on(table.tenantId, table.lastName, table.dob)]
);

export const encounters = pgTable(
  'encounters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    providerId: uuid('provider_id').references(() => users.id),
    encounterType: text('encounter_type').notNull(),
    status: text('status').notNull().default('SCHEDULED'),
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_encounters_tenant_patient_time').on(
      table.tenantId,
      table.patientId,
      table.scheduledStartAt
    ),
  ]
);

export const clinicalNotes = pgTable(
  'clinical_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    noteType: text('note_type').notNull(),
    content: text('content').notNull(),
    language: text('language'),
    locale: text('locale'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signedById: uuid('signed_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_clinical_notes_tenant_patient').on(table.tenantId, table.patientId, table.createdAt),
    index('idx_clinical_notes_encounter_created').on(table.encounterId, table.createdAt),
  ]
);

export const toothChartSnapshots = pgTable(
  'tooth_chart_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    createdById: uuid('created_by_id').references(() => users.id),
    source: text('source').notNull().default('MANUAL'),
    chartJson: jsonb('chart_json').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tooth_chart_snapshots_tenant_patient_time').on(
      table.tenantId,
      table.patientId,
      table.createdAt
    ),
    index('idx_tooth_chart_snapshots_encounter')
      .on(table.encounterId)
      .where(sql`encounter_id IS NOT NULL`),
  ]
);

export const perioMeasurements = pgTable(
  'perio_measurements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
    measuredById: uuid('measured_by_id').references(() => users.id),
    toothNumber: text('tooth_number').notNull(),
    site: text('site').notNull(),
    pocketDepthMm: integer('pocket_depth_mm'),
    gingivalMarginMm: integer('gingival_margin_mm'),
    bleedingOnProbing: boolean('bleeding_on_probing'),
    mobilityGrade: text('mobility_grade'),
    furcationInvolvement: text('furcation_involvement'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_perio_measurement_point').on(
      table.tenantId,
      table.patientId,
      table.encounterId,
      table.measuredAt,
      table.toothNumber,
      table.site
    ),
    index('idx_perio_tenant_patient_time').on(table.tenantId, table.patientId, table.measuredAt),
    index('idx_perio_patient_tooth_site_time').on(
      table.patientId,
      table.toothNumber,
      table.site,
      table.measuredAt
    ),
    index('idx_perio_encounter')
      .on(table.encounterId)
      .where(sql`encounter_id IS NOT NULL`),
  ]
);
