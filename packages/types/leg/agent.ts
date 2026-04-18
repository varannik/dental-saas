import type { ISODateTime, UUID } from '../src/tenancy.js';

export const AGENT_WORKFLOW_TYPES = [
  'CONVERSATIONAL',
  'DIAGNOSTIC',
  'TREATMENT_PLANNING',
  'MULTI_AGENT',
] as const;
export type AgentWorkflowType = (typeof AGENT_WORKFLOW_TYPES)[number];

export const AGENT_EXECUTION_STATUSES = [
  'RUNNING',
  'WAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type AgentExecutionStatus = (typeof AGENT_EXECUTION_STATUSES)[number];

export const AGENT_STEP_NODE_TYPES = [
  'LLM_CALL',
  'TOOL_CALL',
  'DECISION',
  'HUMAN_APPROVAL',
  'CONDITIONAL',
] as const;
export type AgentStepNodeType = (typeof AGENT_STEP_NODE_TYPES)[number];

export const AGENT_STEP_STATUSES = ['COMPLETED', 'FAILED', 'SKIPPED'] as const;
export type AgentStepStatus = (typeof AGENT_STEP_STATUSES)[number];

export interface AgentWorkflow {
  id: UUID;
  tenantId: UUID | null;
  name: string;
  description: string | null;
  workflowType: AgentWorkflowType;
  graphDefinition: Record<string, unknown>;
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
  status: AgentExecutionStatus;
  stateSnapshot: Record<string, unknown>;
  checkpointId: string | null;
  startedAt: ISODateTime;
  completedAt: ISODateTime | null;
  errorDetails: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AgentStep {
  id: UUID;
  executionId: UUID;
  sequenceNo: number;
  nodeName: string;
  nodeType: AgentStepNodeType;
  inputState: Record<string, unknown> | null;
  outputState: Record<string, unknown> | null;
  llmProvider: string | null;
  llmModel: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  toolOutput: Record<string, unknown> | null;
  decisionResult: string | null;
  status: AgentStepStatus;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: ISODateTime;
}
