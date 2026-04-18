/**
 * Shared primitives and tenancy/identity domain models.
 */

export type UUID = string;
export type ISODateTime = string;
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface Tenant {
  id: UUID;
  name: string;
  type: string;
  parentTenantId: UUID | null;
  primaryRegion: string | null;
  defaultLocale: string;
  supportedLocales: string[];
  supportedLanguages: string[];
  partitionStrategy: string;
  status: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Location {
  id: UUID;
  tenantId: UUID;
  name: string;
  address: JsonObject | null;
  timezone: string | null;
  status: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface User {
  id: UUID;
  email: string;
  fullName: string;
  preferredLocale: string | null;
  preferredLanguage: string | null;
  status: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ApiClient {
  id: UUID;
  tenantId: UUID | null;
  clientId: string;
  name: string;
  description: string | null;
  clientSecretHash: string;
  scopes: string[] | null;
  rateLimitPerMinute: number | null;
  ipAllowlist: string[] | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Session {
  id: UUID;
  userId: UUID;
  tenantId: UUID;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: JsonObject | null;
  lastActivityAt: ISODateTime;
  expiresAt: ISODateTime;
  revokedAt: ISODateTime | null;
  revokeReason: string | null;
  createdAt: ISODateTime;
}

export interface UserTenant {
  userId: UUID;
  tenantId: UUID;
  defaultLocationId: UUID | null;
  userType: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Role {
  id: UUID;
  tenantId: UUID | null;
  name: string;
  description: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Permission {
  id: UUID;
  key: string;
  description: string | null;
}

export interface RolePermission {
  roleId: UUID;
  permissionId: UUID;
}

export interface AuditEvent {
  id: UUID;
  tenantId: UUID | null;
  actorType: string;
  actorId: UUID | null;
  eventType: string;
  resourceType: string | null;
  resourceId: UUID | null;
  occurredAt: ISODateTime;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: JsonObject | null;
}

export interface TenantAccessContext {
  userId: UUID;
  tenantId: UUID;
  userType: string;
  roleIds?: UUID[];
  permissions?: string[];
}
