import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface CodeSystem {
  id: UUID;
  tenantId: UUID | null;
  systemKey: string;
  name: string;
  version: string | null;
  isActive: boolean;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CodeValue {
  id: UUID;
  tenantId: UUID | null;
  systemId: UUID;
  code: string;
  display: string;
  description: string | null;
  category: string | null;
  isBillable: boolean;
  isActive: boolean;
  effectiveFrom: ISODateTime | null;
  effectiveTo: ISODateTime | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProcedureCatalog {
  id: UUID;
  tenantId: UUID | null;
  codeValueId: UUID;
  procedureType: string | null;
  defaultDurationMin: number | null;
  requiresTooth: boolean;
  requiresSurface: boolean;
  isActive: boolean;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FeeSchedule {
  id: UUID;
  tenantId: UUID;
  name: string;
  scopeType: string;
  scopeId: UUID | null;
  currency: string;
  effectiveFrom: ISODateTime;
  effectiveTo: ISODateTime | null;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FeeScheduleItem {
  id: UUID;
  feeScheduleId: UUID;
  procedureCatalogId: UUID;
  amount: number;
  minAmount: number | null;
  maxAmount: number | null;
  unit: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
