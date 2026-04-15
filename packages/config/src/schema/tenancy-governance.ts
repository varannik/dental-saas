import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';

import { locations, roles, tenants, users } from './tenancy.js';

export const tenantSettings = pgTable('tenant_settings', {
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .primaryKey(),
  dataResidencyRegion: text('data_residency_region'),
  defaultRetentionPolicy: text('default_retention_policy'),
  localizationDefaults: jsonb('localization_defaults').$type<Record<string, unknown> | null>(),
  clinicalWorkflowOptions: jsonb('clinical_workflow_options').$type<Record<
    string,
    unknown
  > | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantBranding = pgTable('tenant_branding', {
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .primaryKey(),
  logoUri: text('logo_uri'),
  iconUri: text('icon_uri'),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  emailFromName: text('email_from_name'),
  emailReplyTo: text('email_reply_to'),
  customCssUri: text('custom_css_uri'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    tier: text('tier').notNull(),
    monthlyPrice: numeric('monthly_price', { precision: 12, scale: 2 }),
    annualPrice: numeric('annual_price', { precision: 12, scale: 2 }),
    features: jsonb('features').$type<Record<string, unknown> | null>(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('subscription_plans_code_unique').on(table.code)]
);

export const tenantSubscriptions = pgTable(
  'tenant_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    status: text('status').notNull().default('ACTIVE'),
    billingCycle: text('billing_cycle').notNull().default('MONTHLY'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    autoRenew: boolean('auto_renew').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tenant_subscriptions_tenant_status').on(table.tenantId, table.status, table.startAt),
    index('idx_tenant_subscriptions_plan').on(table.planId),
  ]
);

export const tenantFeatures = pgTable(
  'tenant_features',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    featureKey: text('feature_key').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    source: text('source').notNull().default('PLAN'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tenant_features_tenant_feature').on(table.tenantId, table.featureKey),
    index('idx_tenant_features_tenant_enabled').on(table.tenantId, table.isEnabled),
  ]
);

export const tenantQuotas = pgTable('tenant_quotas', {
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .primaryKey(),
  maxUsers: integer('max_users'),
  maxStorageBytes: numeric('max_storage_bytes', { precision: 20, scale: 0 }),
  maxAiInferencesPerMonth: integer('max_ai_inferences_per_month'),
  apiRateLimitPerMinute: integer('api_rate_limit_per_minute'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: uuid('location_id').references(() => locations.id),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_teams_tenant_name').on(table.tenantId, table.name),
    index('idx_teams_tenant_location').on(table.tenantId, table.locationId),
  ]
);

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    locationId: uuid('location_id').references(() => locations.id),
    roleInTeam: text('role_in_team'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('ACTIVE'),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index('idx_team_members_user').on(table.userId),
    index('idx_team_members_team_status').on(table.teamId, table.status),
  ]
);

export const userAuthIdentities = pgTable(
  'user_auth_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: text('email'),
    passwordHash: text('password_hash'),
    mfaSecret: text('mfa_secret'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_user_auth_identities_provider_uid').on(table.provider, table.providerUserId),
    index('idx_user_auth_identities_user').on(table.userId),
  ]
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: uuid('location_id').references(() => locations.id),
    teamId: uuid('team_id').references(() => teams.id),
    resourceScope: text('resource_scope').notNull().default('ALL_LOCATIONS'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_user_roles_assignment').on(
      table.userId,
      table.roleId,
      table.tenantId,
      table.locationId,
      table.teamId
    ),
    index('idx_user_roles_user_tenant').on(table.userId, table.tenantId),
    index('idx_user_roles_role_tenant').on(table.roleId, table.tenantId),
  ]
);
