import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const core = pgSchema('core');

export const regulatoryProfiles = core.table('regulatory_profiles', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  recordRetentionDays: integer('record_retention_days').notNull(),
  auditRetentionDays: integer('audit_retention_days').notNull(),
  voiceConsentRequired: boolean('voice_consent_required').notNull().default(true),
  externalProcessingAllowed: boolean('external_processing_allowed').notNull().default(false),
  externalAiAllowed: boolean('external_ai_allowed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clinics = core.table('clinics', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  regulatoryProfileId: uuid('regulatory_profile_id')
    .notNull()
    .references(() => regulatoryProfiles.id),
  defaultLocale: text('default_locale').notNull().default('en'),
  currency: char('currency', { length: 3 }).notNull(),
  timezone: text('timezone').notNull(),
  toothNotation: text('tooth_notation').notNull().default('FDI'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(1),
});

export const users = core.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  mfaSecret: text('mfa_secret'),
  status: text('status').notNull().default('active'),
  locale: text('locale').notNull().default('en'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = core.table('permissions', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description'),
});

export const roles = core.table(
  'roles',
  {
    id: uuid('id').primaryKey(),
    clinicId: uuid('clinic_id').references(() => clinics.id),
    key: text('key').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('roles_clinic_key_unique').on(table.clinicId, table.key),
    uniqueIndex('roles_system_key_unique')
      .on(table.key)
      .where(sql`clinic_id IS NULL`),
  ]
);

export const rolePermissions = core.table(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]
);

export const memberships = core.table('memberships', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  clinicId: uuid('clinic_id')
    .notNull()
    .references(() => clinics.id),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(1),
});

export const authSessions = core.table('auth_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  familyId: uuid('family_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  device: text('device'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedBy: uuid('replaced_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tables whose rows belong to one clinic and must be invisible to every other clinic. */
export const CLINIC_OWNED_TABLES = ['clinics', 'memberships', 'roles', 'role_permissions'] as const;
