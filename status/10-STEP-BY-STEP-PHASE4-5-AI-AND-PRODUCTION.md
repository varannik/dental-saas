# Step-by-Step: Phase 4 — AI Intelligence Layer & Phase 5 — Production Readiness

**Date:** April 12, 2026

---

## Phase 4: AI Intelligence Layer (Weeks 15-18)

### Week 15: RAG & Memory System

#### Step 1: Enable pgvector

```sql
-- In PostgreSQL (via migration)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create agent_memories table with vector column
CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  api_client_id UUID REFERENCES api_clients(id),
  memory_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_id UUID,
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- OpenAI text-embedding-3-large dimension
  source_type TEXT,
  source_id UUID,
  importance_score NUMERIC(3,2),
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for approximate nearest neighbor search
CREATE INDEX idx_agent_memories_embedding
  ON agent_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### Step 2: Embedding Pipeline

```typescript
// services/voice-agent/src/services/embedding.service.ts

import { OpenAIEmbeddings } from '@langchain/openai';

const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-large',
  dimensions: 1536,
});

export async function createMemory(params: {
  tenantId: string;
  memoryType: 'FACT' | 'SUMMARY' | 'PREFERENCE' | 'PROCEDURE';
  scope: 'GLOBAL' | 'PATIENT' | 'ENCOUNTER';
  scopeId: string;
  content: string;
  sourceType: string;
  sourceId: string;
  importanceScore: number;
}) {
  const [vector] = await embeddings.embedDocuments([params.content]);

  await db.insert(agentMemories).values({
    ...params,
    embedding: vector,
  });
}

export async function searchMemories(params: {
  tenantId: string;
  patientId: string;
  query: string;
  limit?: number;
}) {
  const [queryVector] = await embeddings.embedDocuments([params.query]);

  const results = await db.execute(sql`
    SELECT content, importance_score,
           1 - (embedding <=> ${queryVector}::vector) as similarity
    FROM agent_memories
    WHERE tenant_id = ${params.tenantId}
      AND scope = 'PATIENT'
      AND scope_id = ${params.patientId}
    ORDER BY embedding <=> ${queryVector}::vector
    LIMIT ${params.limit ?? 5}
  `);

  return results;
}
```

#### Step 3: Automatic Memory Creation

```typescript
// After each encounter, create memories from clinical notes:

async function extractMemoriesFromNote(note: ClinicalNote, patientId: string) {
  const llm = new ChatOpenAI({ model: 'gpt-4.1-mini' });

  const response = await llm.invoke([
    {
      role: 'system',
      content:
        'Extract key clinical facts from this note. Return JSON array of {content, type, importance}.',
    },
    {
      role: 'user',
      content: note.content,
    },
  ]);

  const facts = JSON.parse(response.content);

  for (const fact of facts) {
    await createMemory({
      memoryType: fact.type,
      scope: 'PATIENT',
      scopeId: patientId,
      content: fact.content,
      importanceScore: fact.importance,
      sourceType: 'CLINICAL_NOTE',
      sourceId: note.id,
    });
  }
}

// Example: After note "Patient allergic to penicillin, prefers morning appointments"
// Creates memories:
// - FACT: "Patient is allergic to penicillin" (importance: 1.0)
// - PREFERENCE: "Patient prefers morning appointments" (importance: 0.7)
```

#### Step 4: Context Window Assembly

```typescript
export async function buildContextForWorkflow(params: {
  patientId: string;
  tenantId: string;
  currentQuery: string;
  maxTokens: number;
}): Promise<ContextWindow> {
  const items: ContextItem[] = [];
  let tokensUsed = 0;

  // 1. Critical memories (allergies, conditions) — always include
  const critical = await db.query.agentMemories.findMany({
    where: and(
      eq(agentMemories.scopeId, params.patientId),
      gte(agentMemories.importanceScore, 0.9)
    ),
  });
  for (const mem of critical) {
    items.push({ type: 'CRITICAL', content: mem.content, tokens: estimateTokens(mem.content) });
    tokensUsed += estimateTokens(mem.content);
  }

  // 2. Semantically relevant memories
  const relevant = await searchMemories({
    tenantId: params.tenantId,
    patientId: params.patientId,
    query: params.currentQuery,
    limit: 10,
  });

  for (const mem of relevant) {
    const tokenCount = estimateTokens(mem.content);
    if (tokensUsed + tokenCount > params.maxTokens) break;
    items.push({ type: 'RELEVANT', content: mem.content, tokens: tokenCount });
    tokensUsed += tokenCount;
  }

  // 3. Recent encounter summaries
  const recentEncounters = await getRecentEncounterSummaries(params.patientId, 3);
  for (const enc of recentEncounters) {
    const tokenCount = estimateTokens(enc.summary);
    if (tokensUsed + tokenCount > params.maxTokens) break;
    items.push({ type: 'RECENT_ENCOUNTER', content: enc.summary, tokens: tokenCount });
    tokensUsed += tokenCount;
  }

  // Save context window for tracking
  await db.insert(agentContextWindows).values({
    executionId: params.executionId,
    contextItems: items,
    totalTokens: tokensUsed,
    maxTokens: params.maxTokens,
    pruningStrategy: 'IMPORTANCE',
  });

  return { items, totalTokens: tokensUsed };
}
```

---

### Week 16: Multi-Agent Collaboration

#### Step 1: Define Specialized Agents

```typescript
// Diagnostic Agent: Analyzes findings, suggests diagnoses
const diagnosticAgent = {
  name: 'Diagnostic Agent',
  systemPrompt: `You are a dental diagnostic specialist. Analyze clinical findings
    and imaging results to identify conditions, assess severity, and suggest
    appropriate CDT codes.`,
  tools: [analyzeXrayTool, detectCariesTool, assessBoneLossTool],
};

// Treatment Planning Agent: Creates treatment plans
const treatmentPlanAgent = {
  name: 'Treatment Planning Agent',
  systemPrompt: `You are a treatment planning specialist. Create comprehensive
    treatment plans based on diagnoses, considering patient history, insurance
    coverage, and clinical best practices.`,
  tools: [createTreatmentPlanTool, estimateCostsTool],
};

// Insurance Agent: Checks coverage
const insuranceAgent = {
  name: 'Insurance Agent',
  systemPrompt: `You are an insurance verification specialist. Check coverage
    eligibility, estimate patient responsibility, and handle pre-authorizations.`,
  tools: [checkEligibilityTool, estimateCoverageTool],
};

// Scheduling Agent: Manages appointments
const schedulingAgent = {
  name: 'Scheduling Agent',
  systemPrompt: `You are a scheduling assistant. Find available appointment slots
    considering provider availability, patient preferences, and treatment requirements.`,
  tools: [checkAvailabilityTool, scheduleAppointmentTool],
};
```

#### Step 2: Supervisor Workflow

```typescript
// Comprehensive treatment planning workflow:
// "Create comprehensive treatment plan for this patient"

const supervisorWorkflow = new StateGraph({
  /* ... */
});

// Supervisor decides which agent to delegate to
supervisorWorkflow.addNode('supervisor', async (state) => {
  const decision = await supervisorLLM.invoke([
    { role: 'system', content: 'Decide which specialist agent should handle the next step.' },
    { role: 'user', content: `Task: ${state.task}\nCompleted: ${state.completedSteps}` },
  ]);
  return { ...state, nextAgent: decision.agent };
});

supervisorWorkflow.addNode('diagnostic', diagnosticAgent.run);
supervisorWorkflow.addNode('treatment', treatmentPlanAgent.run);
supervisorWorkflow.addNode('insurance', insuranceAgent.run);
supervisorWorkflow.addNode('scheduling', schedulingAgent.run);

// Route based on supervisor decision
supervisorWorkflow.addConditionalEdges('supervisor', (state) => {
  if (state.allDone) return END;
  return state.nextAgent;
});

// Each agent returns to supervisor after completing their task
['diagnostic', 'treatment', 'insurance', 'scheduling'].forEach((agent) => {
  supervisorWorkflow.addEdge(agent, 'supervisor');
});
```

#### Step 3: Agent Communication via Database

All agent messages flow through `agent_conversations` and `agent_messages` tables, creating a full audit trail of how treatment plans are created.

---

### Week 17: Imaging AI Integration

#### Step 1: Radiograph Viewer

```bash
cd apps/web
pnpm add @cornerstonejs/core @cornerstonejs/tools @cornerstonejs/dicom-image-loader
```

Build a dental X-ray viewer component:

- Load DICOM/JPEG images from MinIO/S3
- Pan, zoom, window/level controls
- Measurement tools (ruler, angle)
- AI overlay layer for findings

#### Step 2: AI Detection Overlay

```typescript
// Display AI predictions as colored overlays on X-ray images

interface AIFinding {
  id: string;
  predictionType: string; // 'CARIES', 'BONE_LOSS', 'PERIAPICAL_LESION'
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  toothNumber: string;
}

// Color coding from UI/UX Design Brief:
// Green: confidence > 95%
// Yellow: confidence 85-95%
// Orange/Red: confidence < 85%
```

#### Step 3: Accept/Dismiss Workflow

When AI detects findings:

1. Overlay appears on image
2. Side panel lists all findings with confidence scores
3. Dentist can Accept (adds to dental chart) or Dismiss each
4. Accepted findings auto-populate chart entries
5. Dismissed findings logged for model improvement

---

### Week 18: Smart Suggestions & Analytics

#### Step 1: Proactive Suggestions During Encounters

```typescript
// During an active encounter, the agent proactively suggests:
// - "This patient is due for periapical X-rays (last taken 18 months ago)"
// - "Patient has penicillin allergy — avoid amoxicillin prescriptions"
// - "Based on bone loss pattern, consider periodontal referral"

async function generateSuggestions(patientId: string, encounterId: string) {
  const context = await buildContextForWorkflow({
    patientId,
    currentQuery: 'What should the dentist be aware of for this visit?',
    maxTokens: 4000,
  });

  const suggestions = await llm.invoke([
    { role: 'system', content: 'Generate clinical suggestions based on patient history.' },
    { role: 'user', content: JSON.stringify(context.items) },
  ]);

  return parseSuggestions(suggestions);
}
```

#### Step 2: Practice Analytics Dashboard

```
Dashboard cards:
├── Today's Schedule (encounters, status)
├── Production (revenue this week/month)
├── Case Acceptance Rate (treatment plans presented vs accepted)
├── AI Voice Usage (commands processed, accuracy)
├── LLM Cost Tracking (cost per day/week, by workflow type)
└── Agent Performance (completion rate, avg latency, intervention rate)
```

---

## Phase 5: Production Readiness (Weeks 19-22)

### Week 19: AWS Infrastructure

#### Step 1: Implement Terraform Modules

```
infrastructure/terraform/modules/
├── vpc/          # VPC + subnets (fix existing: add subnets)
├── aurora/       # Aurora Serverless v2 PostgreSQL
├── elasticache/  # ElastiCache Serverless (Valkey)
├── s3/           # S3 buckets (images, backups, static assets)
├── ecs/          # ECS Fargate cluster + task definitions
├── alb/          # Application Load Balancer
├── cloudfront/   # CloudFront distribution
├── acm/          # SSL certificates
├── route53/      # DNS records
├── iam/          # Service roles + policies
├── secretsmanager/ # Secrets
└── waf/          # Web Application Firewall
```

#### Step 2: ECS Fargate Task Definitions

```hcl
# One task definition per service
resource "aws_ecs_task_definition" "auth" {
  family = "${var.project}-auth-${var.environment}"
  container_definitions = jsonencode([{
    name  = "auth"
    image = "${var.ecr_repo}/auth:${var.image_tag}"
    portMappings = [{ containerPort = 4001 }]
    environment = [
      { name = "DATABASE_URL", value = module.aurora.connection_string },
      { name = "REDIS_URL", value = module.elasticache.connection_string },
    ]
    secrets = [
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group  = "/ecs/${var.project}/${var.environment}/auth"
        awslogs-region = var.region
      }
    }
  }])
  requires_compatibilities = ["FARGATE"]
  cpu    = "256"
  memory = "512"
}
```

#### Step 3: CI/CD Pipeline (Working)

Update `.github/workflows/deploy-staging.yml`:

```yaml
jobs:
  deploy:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run build
      - run: pnpm turbo run test

      # Build and push Docker images
      - uses: aws-actions/amazon-ecr-login@v2
      - run: |
          for service in auth users clinical voice-agent; do
            docker build -t $ECR_REPO/$service:$GITHUB_SHA -f services/$service/Dockerfile .
            docker push $ECR_REPO/$service:$GITHUB_SHA
          done

      # Deploy with Terraform
      - run: |
          cd infrastructure/terraform
          terraform init -backend-config=backend-staging.hcl
          terraform apply -auto-approve -var="image_tag=$GITHUB_SHA" -var-file=environments/staging.tfvars

      # Run migrations
      - run: ./scripts/database/migrate.sh staging

      # Smoke tests
      - run: ./scripts/test/smoke-tests.sh staging
```

---

### Week 20: Security & Compliance

#### Step 1: Row-Level Security (RLS)

```sql
-- Enable RLS on all multi-tenant tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON patients
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Set tenant context from application:
-- SET LOCAL app.current_tenant_id = 'tenant-uuid';
```

#### Step 2: HIPAA Audit Logging

Every API endpoint that touches PHI must log to `audit_events`:

```typescript
// Fastify hook: auto-log audit events for clinical endpoints
app.addHook('onResponse', async (request, reply) => {
  if (request.routeOptions.config?.auditLog) {
    await db.insert(auditEvents).values({
      tenantId: request.user.tenantId,
      actorType: 'USER',
      actorId: request.user.id,
      eventType: request.routeOptions.config.auditLog,
      resourceType: request.routeOptions.config.resourceType,
      resourceId: request.params.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });
  }
});
```

#### Step 3: Field-Level Encryption

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ENCRYPTION_KEY = scryptSync(process.env.FIELD_ENCRYPTION_KEY, 'salt', 32);

export function encryptField(value: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptField(encrypted: string): string {
  const [ivHex, authTagHex, dataHex] = encrypted.split(':');
  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8');
}

// Use on: patient.contactEmail, patient.phoneMobile, patient.dob
```

---

### Week 21: Monitoring & Observability

#### Step 1: OpenTelemetry Integration

```bash
pnpm add -w @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
```

```typescript
// packages/config/src/telemetry.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

export function initTelemetry(serviceName: string) {
  const sdk = new NodeSDK({
    serviceName,
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
}
```

#### Step 2: Custom Metrics

```typescript
// Track dental-specific metrics
const voiceCommandCounter = meter.createCounter('voice_commands_total');
const voiceLatencyHistogram = meter.createHistogram('voice_to_action_seconds');
const llmTokenCounter = meter.createCounter('llm_tokens_total');
const llmCostGauge = meter.createHistogram('llm_cost_usd');
const workflowDuration = meter.createHistogram('workflow_duration_seconds');
```

#### Step 3: LangSmith Integration

```typescript
import { Client } from 'langsmith';

const langsmith = new Client({
  apiUrl: 'https://api.smith.langchain.com',
  apiKey: process.env.LANGSMITH_API_KEY,
});

// All LangGraph workflows automatically traced
// View at: https://smith.langchain.com/
```

---

### Week 22: Testing & Quality Gate

#### Step 1: Unit Test Coverage

```bash
# Target: 80%+ coverage on critical paths
pnpm turbo run test:coverage

# Key areas to cover:
# - Intent parsing (all dental commands)
# - Entity normalization (tooth numbers, surfaces)
# - Workflow logic (all branches and edge cases)
# - Auth (token issuance, validation, refresh)
# - API endpoints (all CRUD operations)
```

#### Step 2: E2E Test Suite

```typescript
// tests/e2e/tests/voice-workflow.spec.ts
import { test, expect } from '@playwright/test';

test('full voice command workflow', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'dentist@demo.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Navigate to patient
  await page.click('text=John Doe');
  await page.click('text=New Encounter');

  // Simulate voice command (inject transcript via API)
  await page.evaluate(() => {
    window.postMessage({ type: 'test_voice_command', transcript: 'Mark tooth 14 as missing' });
  });

  // Verify confirmation card appears
  await expect(page.locator('[data-testid="confirmation-card"]')).toBeVisible();
  await expect(page.locator('[data-testid="confirmation-card"]')).toContainText('tooth #14');

  // Confirm
  await page.click('[data-testid="confirm-button"]');

  // Verify dental chart updated
  await expect(page.locator('[data-testid="tooth-14"]')).toHaveClass(/missing/);

  // Verify undo toast appears
  await expect(page.locator('[data-testid="undo-toast"]')).toBeVisible();
});
```

#### Step 3: Load Testing

```javascript
// tests/load/scenarios/voice-load.js (k6)
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 }, // Ramp to 20 concurrent voice sessions
    { duration: '5m', target: 50 }, // Ramp to 50
    { duration: '2m', target: 100 }, // Peak: 100 concurrent
    { duration: '1m', target: 0 }, // Ramp down
  ],
};

export default function () {
  const url = 'ws://staging.dental-saas.com/voice/stream';
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Send test audio chunks
      socket.sendBinary(testAudioBuffer);
    });
    socket.on('message', (msg) => {
      check(JSON.parse(msg), {
        'transcript received': (m) => m.type === 'transcript_final',
      });
    });
  });
  check(res, { 'WebSocket connected': (r) => r && r.status === 101 });
}
```

---

## Production Launch Checklist

```
Infrastructure:
  ☐ Aurora Serverless v2 running with pgvector
  ☐ ElastiCache Serverless running
  ☐ S3 buckets created and configured
  ☐ ECS Fargate services deployed
  ☐ CloudFront + SSL configured
  ☐ WAF rules enabled
  ☐ DNS configured

Security:
  ☐ RLS enabled on all multi-tenant tables
  ☐ Field-level encryption on PHI columns
  ☐ All endpoints require authentication
  ☐ Rate limiting active
  ☐ CORS properly configured
  ☐ Security headers set
  ☐ Secrets in AWS Secrets Manager
  ☐ BAA signed with OpenAI/Deepgram

Monitoring:
  ☐ OpenTelemetry traces flowing
  ☐ LangSmith connected
  ☐ Grafana dashboards configured
  ☐ PagerDuty/Slack alerts configured
  ☐ Health check endpoints responding
  ☐ Error tracking (Sentry) configured

Testing:
  ☐ 80%+ unit test coverage
  ☐ E2E tests passing
  ☐ Load test: 100 concurrent users stable
  ☐ Voice latency: <3s p95
  ☐ No critical security findings

Data:
  ☐ Migrations tested on production-like data
  ☐ Backup/restore tested
  ☐ CDT reference data loaded
  ☐ Default roles and permissions seeded

Documentation:
  ☐ API documentation generated
  ☐ Runbook for common operations
  ☐ Incident response plan documented
  ☐ User onboarding guide
```
