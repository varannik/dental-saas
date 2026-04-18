import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface AgentWorkflow {
  id: UUID;
  tenantId: UUID | null;
  name: string;
  description: string | null;
  workflowType: string;
  graphDefinition: JsonObject;
  entryNode: string;
  exitNodes: string[];
  version: string;
  isActive: boolean;
  createdById: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AgentExecution {
  id: UUID;
  workflowId: UUID;
  tenantId: UUID;
  apiClientId: UUID | null;
  voiceSessionId: UUID | null;
  userId: UUID | null;
  patientId: UUID | null;
  encounterId: UUID | null;
  inputLocale: string | null;
  outputLocale: string | null;
  currentNode: string;
  status: string;
  stateSnapshot: JsonObject;
  checkpointId: string | null;
  startedAt: ISODateTime;
  completedAt: ISODateTime | null;
  errorDetails: string | null;
  metadata: JsonObject | null;
}

export interface AgentStep {
  id: UUID;
  executionId: UUID;
  sequenceNo: number;
  nodeName: string;
  nodeType: string;
  inputState: JsonObject | null;
  outputState: JsonObject | null;
  llmProvider: string | null;
  llmModel: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  toolName: string | null;
  toolInput: JsonObject | null;
  toolOutput: JsonObject | null;
  decisionResult: string | null;
  status: string;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: ISODateTime;
}

export interface AgentTool {
  id: UUID;
  tenantId: UUID | null;
  name: string;
  description: string;
  category: string;
  functionSchema: JsonObject;
  implementationType: string;
  endpointUri: string | null;
  authConfig: JsonObject | null;
  timeoutMs: number;
  retryPolicy: JsonObject | null;
  rateLimit: number | null;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ToolExecution {
  id: UUID;
  agentStepId: UUID | null;
  toolId: UUID;
  tenantId: UUID;
  apiClientId: UUID | null;
  inputParams: JsonObject;
  outputResult: JsonObject | null;
  status: string;
  httpStatus: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  retryCount: number;
  startedAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface AgentConversation {
  id: UUID;
  tenantId: UUID;
  conversationType: string;
  initiatorType: string;
  initiatorId: UUID;
  patientId: UUID | null;
  encounterId: UUID | null;
  status: string;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  metadata: JsonObject | null;
}

export interface AgentMessage {
  id: UUID;
  conversationId: UUID;
  sequenceNo: number;
  senderType: string;
  senderId: UUID;
  recipientType: string | null;
  recipientId: UUID | null;
  messageType: string;
  content: string | null;
  functionCall: JsonObject | null;
  metadata: JsonObject | null;
  createdAt: ISODateTime;
}

export interface AgentMemory {
  id: UUID;
  tenantId: UUID;
  apiClientId: UUID | null;
  memoryType: string;
  scope: string;
  scopeId: UUID | null;
  content: string;
  contentLocale: string | null;
  contentLanguage: string | null;
  embedding: unknown | null;
  sourceType: string | null;
  sourceId: UUID | null;
  importanceScore: number | null;
  accessCount: number;
  lastAccessedAt: ISODateTime | null;
  expiresAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface AgentContextWindow {
  id: UUID;
  executionId: UUID;
  stepId: UUID | null;
  contextItems: JsonObject;
  totalTokens: number;
  maxTokens: number;
  pruningStrategy: string | null;
  createdAt: ISODateTime;
}

export interface AgentApprovalRequest {
  id: UUID;
  executionId: UUID;
  stepId: UUID | null;
  toolExecutionId: UUID | null;
  tenantId: UUID;
  requestedAction: string;
  actionDetails: JsonObject;
  reason: string | null;
  priority: string;
  assignedToUserId: UUID | null;
  status: string;
  reviewerId: UUID | null;
  reviewComment: string | null;
  reviewedAt: ISODateTime | null;
  timeoutAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface AgentIntervention {
  id: UUID;
  executionId: UUID | null;
  stepId: UUID | null;
  tenantId: UUID;
  userId: UUID;
  interventionType: string;
  originalAction: JsonObject | null;
  correctedAction: JsonObject | null;
  reason: string | null;
  useForTraining: boolean;
  createdAt: ISODateTime;
}

export interface ActionHistory {
  id: UUID;
  tenantId: UUID;
  userId: UUID;
  voiceSessionId: UUID | null;
  voiceUtteranceId: UUID | null;
  agentExecutionId: UUID | null;
  approvalRequestId: UUID | null;
  entityType: string;
  entityId: UUID;
  actionType: string;
  previousState: JsonObject | null;
  newState: JsonObject;
  changeSummary: string | null;
  isUndone: boolean;
  undoneAt: ISODateTime | null;
  undoneByUserId: UUID | null;
  undoReason: string | null;
  undoExpiresAt: ISODateTime;
  createdAt: ISODateTime;
}

export interface AgentMetric {
  id: UUID;
  executionId: UUID;
  tenantId: UUID;
  metricName: string;
  metricValue: number;
  metricUnit: string | null;
  recordedAt: ISODateTime;
}
