export enum SubscriptionPlan {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  CANCELLED = 'cancelled'
}

export interface Tenant {
  id: string;
  name: string;
  domain: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterTenantRequest {
  name: string;
  domain: string;
  email: string;
  password: string;
  plan: SubscriptionPlan;
}

export interface RegisterTenantResponse {
  tenantId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export interface UpdateTenantRequest {
  name?: string;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
}

export interface TenantResponse {
  id: string;
  name: string;
  domain: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  createdAt: Date;
  userCount: number;
} 