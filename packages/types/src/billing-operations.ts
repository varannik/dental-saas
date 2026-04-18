import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface BillingPlan {
  id: UUID;
  code: string;
  name: string;
  billingCycle: string;
  currency: string;
  basePrice: number;
  includedSeats: number | null;
  includedAiCalls: number | null;
  includedStorageGb: number | null;
  overagePolicy: JsonObject | null;
  metadata: JsonObject | null;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TenantBillingAccount {
  id: UUID;
  tenantId: UUID;
  billingPlanId: UUID;
  status: string;
  billingEmail: string | null;
  billingAddress: JsonObject | null;
  paymentProvider: string | null;
  paymentCustomerRef: string | null;
  paymentMethodRef: string | null;
  taxId: string | null;
  nextBillingDate: ISODateTime | null;
  autoPay: boolean;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UsageMeter {
  id: UUID;
  tenantId: UUID | null;
  meterKey: string;
  unit: string;
  aggregationType: string;
  resetPeriod: string;
  isBillable: boolean;
  isActive: boolean;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UsageMeterReading {
  id: UUID;
  tenantId: UUID;
  usageMeterId: UUID;
  periodStart: ISODateTime;
  periodEnd: ISODateTime;
  readingValue: number;
  source: string | null;
  capturedAt: ISODateTime;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
}

export interface Invoice {
  id: UUID;
  tenantId: UUID;
  tenantBillingAccountId: UUID;
  invoiceNumber: string | null;
  periodStart: ISODateTime;
  periodEnd: ISODateTime;
  status: string;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  outstandingAmount: number;
  issuedAt: ISODateTime | null;
  dueDate: ISODateTime | null;
  paidAt: ISODateTime | null;
  notes: string | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface InvoiceLineItem {
  id: UUID;
  invoiceId: UUID;
  usageMeterReadingId: UUID | null;
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  currency: string;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
}

export interface ClaimStatusEvent {
  id: UUID;
  claimId: UUID;
  tenantId: UUID;
  fromStatus: string | null;
  toStatus: string;
  statusCode: string | null;
  payerMessage: string | null;
  eventAt: ISODateTime;
  rawPayload: JsonObject | null;
  createdByUserId: UUID | null;
  createdAt: ISODateTime;
}
