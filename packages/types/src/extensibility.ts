import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface DrugReference {
  id: UUID;
  tenantId: UUID | null;
  rxnormCode: string;
  name: string;
  genericName: string | null;
  strength: string | null;
  form: string | null;
  route: string | null;
  isControlled: boolean;
  isActive: boolean;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CustomFieldDefinition {
  id: UUID;
  tenantId: UUID;
  entityType: string;
  fieldKey: string;
  label: string;
  valueType: string;
  isRequired: boolean;
  isIndexed: boolean;
  validationRules: JsonObject | null;
  defaultValue: JsonObject | null;
  status: string;
  createdByUserId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CustomFieldValue {
  id: UUID;
  tenantId: UUID;
  definitionId: UUID;
  entityType: string;
  entityId: UUID;
  valueJson: JsonObject | null;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: ISODateTime | null;
  recordedAt: ISODateTime;
  createdByUserId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Workflow {
  id: UUID;
  tenantId: UUID;
  key: string;
  name: string;
  description: string | null;
  workflowType: string;
  version: number;
  definition: JsonObject;
  triggerType: string | null;
  isActive: boolean;
  createdByUserId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface WorkflowInstance {
  id: UUID;
  tenantId: UUID;
  workflowId: UUID;
  entityType: string | null;
  entityId: UUID | null;
  status: string;
  inputPayload: JsonObject | null;
  context: JsonObject | null;
  currentStep: string | null;
  startedByUserId: UUID | null;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  failedAt: ISODateTime | null;
  errorMessage: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
