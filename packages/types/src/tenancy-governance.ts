import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface TenantSetting {
  tenantId: UUID;
  dataResidencyRegion: string | null;
  defaultRetentionPolicy: string | null;
  localizationDefaults: JsonObject | null;
  clinicalWorkflowOptions: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TenantBranding {
  tenantId: UUID;
  logoUri: string | null;
  iconUri: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
  customCssUri: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SubscriptionPlan {
  id: UUID;
  code: string;
  name: string;
  tier: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  features: JsonObject | null;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TenantSubscription {
  id: UUID;
  tenantId: UUID;
  planId: UUID;
  startAt: ISODateTime;
  endAt: ISODateTime | null;
  status: string;
  billingCycle: string;
  trialEndsAt: ISODateTime | null;
  autoRenew: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TenantFeature {
  id: UUID;
  tenantId: UUID;
  featureKey: string;
  isEnabled: boolean;
  source: string;
  expiresAt: ISODateTime | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TenantQuota {
  tenantId: UUID;
  maxUsers: number | null;
  maxStorageBytes: number | null;
  maxAiInferencesPerMonth: number | null;
  apiRateLimitPerMinute: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Team {
  id: UUID;
  tenantId: UUID;
  locationId: UUID | null;
  name: string;
  description: string | null;
  status: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TeamMember {
  teamId: UUID;
  userId: UUID;
  locationId: UUID | null;
  roleInTeam: string | null;
  joinedAt: ISODateTime;
  status: string;
}

export interface UserAuthIdentity {
  id: UUID;
  userId: UUID;
  provider: string;
  providerUserId: string;
  email: string | null;
  passwordHash: string | null;
  mfaSecret: string | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UserRole {
  id: UUID;
  userId: UUID;
  roleId: UUID;
  tenantId: UUID;
  locationId: UUID | null;
  teamId: UUID | null;
  resourceScope: string;
  validFrom: ISODateTime | null;
  validUntil: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
