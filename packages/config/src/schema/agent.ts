import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import { encounters, patients } from './clinical.js';
import { apiClients, tenants, users } from './tenancy.js';
import { voiceSessions, voiceUtterances } from './voice.js';

export const agentWorkflows = pgTable(
  'agent_workflows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    workflowType: text('workflow_type').notNull(),
    graphDefinition: jsonb('graph_definition').$type<Record<string, unknown>>().notNull(),
    entryNode: text('entry_node').notNull(),
    exitNodes: jsonb('exit_nodes').$type<string[]>().notNull(),
    version: text('version').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_agent_workflows_tenant_active').on(table.tenantId, table.isActive)]
);

export const agentExecutions = pgTable(
  'agent_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => agentWorkflows.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    apiClientId: uuid('api_client_id').references(() => apiClients.id),
    voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id),
    userId: uuid('user_id').references(() => users.id),
    patientId: uuid('patient_id').references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    inputLocale: text('input_locale'),
    outputLocale: text('output_locale'),
    currentNode: text('current_node').notNull(),
    status: text('status').notNull().default('RUNNING'),
    stateSnapshot: jsonb('state_snapshot').$type<Record<string, unknown>>().notNull(),
    checkpointId: text('checkpoint_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorDetails: text('error_details'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index('idx_agent_executions_tenant_status').on(table.tenantId, table.status, table.startedAt),
    index('idx_agent_executions_voice_session').on(table.voiceSessionId),
  ]
);

export const agentSteps = pgTable(
  'agent_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => agentExecutions.id),
    sequenceNo: integer('sequence_no').notNull(),
    nodeName: text('node_name').notNull(),
    nodeType: text('node_type').notNull(),
    inputState: jsonb('input_state').$type<Record<string, unknown> | null>(),
    outputState: jsonb('output_state').$type<Record<string, unknown> | null>(),
    llmProvider: text('llm_provider'),
    llmModel: text('llm_model'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    toolName: text('tool_name'),
    toolInput: jsonb('tool_input').$type<Record<string, unknown> | null>(),
    toolOutput: jsonb('tool_output').$type<Record<string, unknown> | null>(),
    decisionResult: text('decision_result'),
    status: text('status').notNull().default('COMPLETED'),
    durationMs: integer('duration_ms'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_agent_steps_execution_seq').on(table.executionId, table.sequenceNo)]
);

export const agentTools = pgTable(
  'agent_tools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    functionSchema: jsonb('function_schema').$type<Record<string, unknown>>().notNull(),
    implementationType: text('implementation_type').notNull(),
    endpointUri: text('endpoint_uri'),
    authConfig: jsonb('auth_config').$type<Record<string, unknown> | null>(),
    timeoutMs: integer('timeout_ms').notNull().default(30000),
    retryPolicy: jsonb('retry_policy').$type<Record<string, unknown> | null>(),
    rateLimit: integer('rate_limit'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('agent_tools_name_unique').on(table.name),
    index('idx_agent_tools_tenant_active').on(table.tenantId, table.isActive),
  ]
);

export const toolExecutions = pgTable(
  'tool_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentStepId: uuid('agent_step_id').references(() => agentSteps.id),
    toolId: uuid('tool_id')
      .notNull()
      .references(() => agentTools.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    apiClientId: uuid('api_client_id').references(() => apiClients.id),
    inputParams: jsonb('input_params').$type<Record<string, unknown>>().notNull(),
    outputResult: jsonb('output_result').$type<Record<string, unknown> | null>(),
    status: text('status').notNull().default('PENDING'),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms'),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_tool_executions_tenant_tool_time').on(table.tenantId, table.toolId, table.startedAt),
    index('idx_tool_executions_step').on(table.agentStepId),
  ]
);

export const agentConversations = pgTable(
  'agent_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    conversationType: text('conversation_type').notNull(),
    initiatorType: text('initiator_type').notNull(),
    initiatorId: uuid('initiator_id').notNull(),
    patientId: uuid('patient_id').references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    status: text('status').notNull().default('ACTIVE'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index('idx_agent_conversations_tenant_status').on(
      table.tenantId,
      table.status,
      table.startedAt
    ),
  ]
);

export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agentConversations.id),
    sequenceNo: integer('sequence_no').notNull(),
    senderType: text('sender_type').notNull(),
    senderId: uuid('sender_id').notNull(),
    recipientType: text('recipient_type'),
    recipientId: uuid('recipient_id'),
    messageType: text('message_type').notNull(),
    content: text('content'),
    functionCall: jsonb('function_call').$type<Record<string, unknown> | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_agent_messages_conversation_seq').on(table.conversationId, table.sequenceNo),
  ]
);

export const agentMemories = pgTable(
  'agent_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    apiClientId: uuid('api_client_id').references(() => apiClients.id),
    memoryType: text('memory_type').notNull(),
    scope: text('scope').notNull(),
    scopeId: uuid('scope_id'),
    content: text('content').notNull(),
    contentLocale: text('content_locale'),
    contentLanguage: text('content_language'),
    embedding: vector('embedding', { dimensions: 1536 }),
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    importanceScore: numeric('importance_score', { precision: 3, scale: 2 }),
    accessCount: integer('access_count').notNull().default(0),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_agent_memories_tenant_scope').on(table.tenantId, table.scope, table.scopeId),
    index('idx_agent_memories_tenant_lang_scope').on(
      table.tenantId,
      table.contentLanguage,
      table.scope,
      table.scopeId
    ),
    index('idx_agent_memories_embedding').using('ivfflat', table.embedding),
  ]
);

export const agentContextWindows = pgTable(
  'agent_context_windows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => agentExecutions.id),
    stepId: uuid('step_id').references(() => agentSteps.id),
    contextItems: jsonb('context_items').$type<Record<string, unknown>[]>().notNull(),
    totalTokens: integer('total_tokens').notNull(),
    maxTokens: integer('max_tokens').notNull(),
    pruningStrategy: text('pruning_strategy'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_agent_context_execution').on(table.executionId)]
);

export const agentApprovalRequests = pgTable(
  'agent_approval_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => agentExecutions.id),
    stepId: uuid('step_id').references(() => agentSteps.id),
    toolExecutionId: uuid('tool_execution_id').references(() => toolExecutions.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    requestedAction: text('requested_action').notNull(),
    actionDetails: jsonb('action_details').$type<Record<string, unknown>>().notNull(),
    reason: text('reason'),
    priority: text('priority').notNull().default('NORMAL'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    status: text('status').notNull().default('PENDING'),
    reviewerId: uuid('reviewer_id').references(() => users.id),
    reviewComment: text('review_comment'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    timeoutAt: timestamp('timeout_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_approval_requests_tenant_status').on(
      table.tenantId,
      table.status,
      table.priority,
      table.createdAt
    ),
    index('idx_approval_requests_assigned').on(table.assignedToUserId, table.status),
  ]
);

export const agentInterventions = pgTable(
  'agent_interventions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    executionId: uuid('execution_id').references(() => agentExecutions.id),
    stepId: uuid('step_id').references(() => agentSteps.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    interventionType: text('intervention_type').notNull(),
    originalAction: jsonb('original_action').$type<Record<string, unknown> | null>(),
    correctedAction: jsonb('corrected_action').$type<Record<string, unknown> | null>(),
    reason: text('reason'),
    useForTraining: boolean('use_for_training').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_agent_interventions_tenant_time').on(table.tenantId, table.createdAt),
    index('idx_agent_interventions_training').on(table.useForTraining, table.createdAt),
  ]
);

export const actionHistory = pgTable(
  'action_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id),
    voiceUtteranceId: uuid('voice_utterance_id').references(() => voiceUtterances.id),
    agentExecutionId: uuid('agent_execution_id').references(() => agentExecutions.id),
    approvalRequestId: uuid('approval_request_id').references(() => agentApprovalRequests.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    actionType: text('action_type').notNull(),
    previousState: jsonb('previous_state').$type<Record<string, unknown> | null>(),
    newState: jsonb('new_state').$type<Record<string, unknown>>().notNull(),
    changeSummary: text('change_summary'),
    isUndone: boolean('is_undone').notNull().default(false),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    undoneByUserId: uuid('undone_by_user_id').references(() => users.id),
    undoReason: text('undo_reason'),
    undoExpiresAt: timestamp('undo_expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_action_history_user_recent').on(table.userId, table.createdAt.desc()),
    index('idx_action_history_undoable')
      .on(table.tenantId, table.isUndone, table.undoExpiresAt)
      .where(sql`is_undone = false AND undo_expires_at > NOW()`),
    index('idx_action_history_voice_session').on(table.voiceSessionId),
    index('idx_action_history_entity').on(table.entityType, table.entityId, table.createdAt.desc()),
    index('idx_action_history_cleanup')
      .on(table.undoExpiresAt)
      .where(sql`is_undone = false`),
  ]
);

export const agentMetrics = pgTable(
  'agent_metrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => agentExecutions.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    metricName: text('metric_name').notNull(),
    metricValue: numeric('metric_value').notNull(),
    metricUnit: text('metric_unit'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_agent_metrics_tenant_metric_time').on(
      table.tenantId,
      table.metricName,
      table.recordedAt
    ),
  ]
);
