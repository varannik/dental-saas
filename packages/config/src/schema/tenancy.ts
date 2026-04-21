import { sql } from 'drizzle-orm';
import {
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    parentTenantId: uuid('parent_tenant_id').references((): AnyPgColumn => tenants.id),
    primaryRegion: text('primary_region'),
    defaultLocale: text('default_locale').notNull().default('en-US'),
    supportedLocales: jsonb('supported_locales').$type<string[]>().notNull().default(['en-US']),
    supportedLanguages: jsonb('supported_languages').$type<string[]>().notNull().default(['en']),
    partitionStrategy: text('partition_strategy').notNull().default('ROW_LEVEL'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_tenants_parent').on(table.parentTenantId)]
);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    address: jsonb('address').$type<Record<string, unknown> | null>(),
    timezone: text('timezone'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_locations_tenant').on(table.tenantId)]
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    preferredLocale: text('preferred_locale'),
    preferredLanguage: text('preferred_language'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)]
);

export const apiClients = pgTable(
  'api_clients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    clientId: text('client_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    clientSecretHash: text('client_secret_hash').notNull(),
    scopes: jsonb('scopes').$type<string[] | null>(),
    rateLimitPerMinute: integer('rate_limit_per_minute'),
    ipAllowlist: jsonb('ip_allowlist').$type<string[] | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('api_clients_client_id_unique').on(table.clientId),
    index('idx_api_clients_tenant').on(table.tenantId),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tokenHash: text('token_hash').notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    deviceInfo: jsonb('device_info').$type<Record<string, unknown> | null>(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: text('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_sessions_user_active')
      .on(table.userId, table.expiresAt)
      .where(sql`revoked_at IS NULL`),
    index('idx_sessions_tenant').on(table.tenantId, table.createdAt),
    uniqueIndex('idx_sessions_token_hash').on(table.tokenHash),
    index('idx_sessions_cleanup')
      .on(table.expiresAt)
      .where(sql`revoked_at IS NULL`),
  ]
);

export const userTenants = pgTable(
  'user_tenants',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    defaultLocationId: uuid('default_location_id').references(() => locations.id),
    userType: text('user_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tenantId] }),
    index('idx_user_tenants_tenant').on(table.tenantId),
  ]
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_roles_tenant_name').on(table.tenantId, table.name)]
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    description: text('description'),
  },
  (table) => [uniqueIndex('permissions_key_unique').on(table.key)]
);

export const rolePermissions = pgTable(
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

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    eventType: text('event_type').notNull(),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index('idx_audit_tenant_time').on(table.tenantId, table.occurredAt),
    index('idx_audit_resource').on(table.resourceType, table.resourceId),
  ]
);
