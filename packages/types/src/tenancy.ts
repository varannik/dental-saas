/**
 * Tenancy and identity domain types derived from docs/architecture/schema-core.yaml.
 * These are transport/domain-facing types (not ORM models).
 */

export type UUID = string;
export type ISODateTime = string;

export const TENANT_TYPES = [
  'SOLO_PRACTICE',
  'GROUP_PRACTICE',
  'DSO',
  'ACADEMIC',
  'PAYER',
  'REGULATOR',
  'AI_VENDOR',
  'OTHER',
] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

export const PARTITION_STRATEGIES = ['ROW_LEVEL', 'SCHEMA', 'DATABASE'] as const;
export type PartitionStrategy = (typeof PARTITION_STRATEGIES)[number];

export const USER_TYPES = [
  'DENTIST',
  'HYGIENIST',
  'ASSISTANT',
  'ADMIN',
  'FRONT_DESK',
  'PATIENT',
  'PAYER_ANALYST',
  'REGULATOR',
  'DEVELOPER',
] as const;
export type UserType = (typeof USER_TYPES)[number];

export const ACTOR_TYPES = ['USER', 'SYSTEM', 'API_CLIENT'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const USER_STATUSES = ['ACTIVE', 'INVITED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Top-level organization (practice/DSO/payer/etc).
 */
export interface Tenant {
  id: UUID;
  name: string;
  type: TenantType;
  parentTenantId: UUID | null;
  primaryRegion: string | null;
  defaultLocale: string;
  supportedLocales: string[];
  supportedLanguages: string[];
  partitionStrategy: PartitionStrategy;
  status: TenantStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Physical or virtual site under a tenant.
 */
export interface Location {
  id: UUID;
  tenantId: UUID;
  name: string;
  address: Record<string, unknown> | null;
  timezone: string | null;
  status: TenantStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Global user identity mapped to tenant memberships through UserTenant.
 */
export interface User {
  id: UUID;
  email: string;
  fullName: string;
  preferredLocale: string | null;
  preferredLanguage: string | null;
  status: UserStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Membership record connecting users to tenants and their functional role.
 */
export interface UserTenant {
  userId: UUID;
  tenantId: UUID;
  defaultLocationId: UUID | null;
  userType: UserType;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Role can be global (tenantId = null) or tenant-scoped.
 */
export interface Role {
  id: UUID;
  tenantId: UUID | null;
  name: string;
  description: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Lightweight access context used by services to enforce tenant scoping.
 */
export interface TenantAccessContext {
  userId: UUID;
  tenantId: UUID;
  userType: UserType;
  roleIds?: UUID[];
  permissions?: string[];
}
