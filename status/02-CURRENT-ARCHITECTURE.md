# Current Architecture - Dental SaaS Platform

**Date:** April 12, 2026

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (Planned)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │  Web App      │  │  Admin App   │  │  Mobile App                  │ │
│  │  (Next.js)    │  │  (Next.js)   │  │  (React Native / Expo)       │ │
│  │  apps/web     │  │  apps/admin  │  │  apps/mobile                 │ │
│  │  STATUS: N/A  │  │  STATUS: N/A │  │  STATUS: N/A                 │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ HTTPS / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY LAYER (Planned)                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  API Gateway (Fastify / Express)                                 │  │
│  │  - Rate limiting, JWT validation, request routing                │  │
│  │  - WebSocket upgrade for voice streaming                         │  │
│  │  - apps/api-gateway     STATUS: N/A                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ Internal HTTP / gRPC
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    MICROSERVICES LAYER (Planned)                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────────────┐   │
│  │   Auth      │ │   Users    │ │  Billing   │ │  Notifications    │   │
│  │  service    │ │  service   │ │  service   │ │  service          │   │
│  │  STATUS:N/A │ │  STATUS:N/A│ │  STATUS:N/A│ │  STATUS: N/A      │   │
│  └────────────┘ └────────────┘ └────────────┘ └───────────────────┘   │
│  ┌────────────┐ ┌────────────────────────────────────────────────────┐ │
│  │   Files    │ │   AI Voice Agent Service (Core Product)            │ │
│  │  service   │ │   - Voice capture (WebSocket + ASR)                │ │
│  │  STATUS:N/A│ │   - Intent parsing (LLM)                          │ │
│  └────────────┘ │   - Workflow orchestration (LangGraph)             │ │
│                 │   - Multi-agent collaboration                      │ │
│                 │   STATUS: Schema designed, not implemented          │ │
│                 └────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER (Partially Running)                    │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  PostgreSQL 16   │  │  Redis 7     │  │  MinIO / S3               │ │
│  │  - Core schema   │  │  - Sessions  │  │  - DICOM/images           │ │
│  │  - Agent tables  │  │  - Cache     │  │  - Backups                │ │
│  │  - pgvector (RAG)│  │  - Pub/Sub   │  │  - Files                  │ │
│  │  DOCKER: ✅      │  │  DOCKER: ✅  │  │  DOCKER: ✅               │ │
│  │  SCHEMA: YAML    │  │  PATTERNS:Doc│  │  BUCKETS: Auto-created    │ │
│  │  DDL: Not gen'd  │  │  CODE: None  │  │  CODE: None               │ │
│  └─────────────────┘  └──────────────┘  └───────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  LocalStack (AWS Mock)                                           │  │
│  │  Services: S3, DynamoDB, Lambda, API GW, CloudWatch, IAM,       │  │
│  │            SecretsManager, SNS, SQS, RDS                        │  │
│  │  DOCKER: ✅   Region: eu-central-1                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE LAYER                                  │
│  ┌──────────────────┐  ┌───────────────┐  ┌──────────────────────┐    │
│  │ Docker Compose    │  │ Terraform     │  │ Kubernetes / Helm    │    │
│  │ STATUS: ✅ Working│  │ STATUS: VPC   │  │ STATUS: Templates    │    │
│  │ 5 services        │  │ only; rest    │  │ only; no real        │    │
│  │                   │  │ commented out │  │ cluster config       │    │
│  └──────────────────┘  └───────────────┘  └──────────────────────┘    │
│  ┌──────────────────┐  ┌───────────────┐  ┌──────────────────────┐    │
│  │ GitHub Actions    │  │ Monitoring    │  │ Makefile + Scripts   │    │
│  │ STATUS: 4 YAMLs   │  │ STATUS: Conf  │  │ STATUS: 60+ cmds    │    │
│  │ (would fail w/o   │  │ templates     │  │ 12/73 scripts impl   │    │
│  │ app code)         │  │ (Prom/Grafana)│  │                      │    │
│  └──────────────────┘  └───────────────┘  └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Architecture

### Core Schema (25+ entities)

```
┌───────────────────────────────────────────────────────────────┐
│                    TENANCY & IDENTITY                          │
│  tenants → locations                                          │
│  users → user_tenants (many-to-many with tenants)             │
│  roles → permissions → role_permissions                       │
│  api_clients (machine-to-machine for AI agents)               │
│  sessions (Redis primary, Postgres audit)                     │
│  audit_events (partitioned by month)                          │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────┐
│                    CLINICAL & ENCOUNTERS                       │
│  patients → encounters → clinical_notes                       │
│  dental_chart_entries (tooth-level data)                       │
│  treatment_plans → treatment_plan_items                        │
│  claims → claim_lines                                         │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────┐
│                    IMAGING & AI                                │
│  imaging_studies → imaging_objects → image_annotations         │
│  ai_models → ai_model_versions → ai_inference_jobs            │
│  ai_predictions (with ROI annotations)                        │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────┐
│                    VOICE & CONVERSATIONAL AI                   │
│  voice_sessions → voice_utterances (with intent/entities)     │
│  voice_recordings (audio blob references)                     │
└───────────────────────────────────────────────────────────────┘

### Agent Extensions Schema (13 entities)

┌───────────────────────────────────────────────────────────────┐
│                    WORKFLOW ORCHESTRATION                      │
│  agent_workflows (LangGraph state graph definitions)          │
│  agent_executions (runtime workflow instances)                 │
│  agent_steps (individual node executions)                     │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────┐
│                    TOOL ECOSYSTEM                              │
│  agent_tools (registry with OpenAI function schemas)          │
│  tool_executions (input/output/performance tracking)          │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────┐
│                    MULTI-AGENT COLLABORATION                  │
│  agent_conversations (group chat, hierarchical, sequential)   │
│  agent_messages (agent-to-agent communication)                │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────┐
│                    MEMORY & SAFETY                             │
│  agent_memories (RAG with pgvector embeddings)                │
│  agent_context_windows (token management)                     │
│  agent_approval_requests (HITL)                               │
│  agent_interventions (human corrections)                      │
│  action_history (5-min undo window)                           │
│  agent_metrics (performance KPIs)                             │
└───────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
dental-saas/
├── apps/                          # Frontend applications
│   ├── web/                       # Patient-facing + dentist web app (Next.js)
│   ├── admin/                     # System admin dashboard (Next.js)
│   ├── mobile/                    # Mobile app (React Native / Expo)
│   └── api-gateway/               # API Gateway (Fastify)
│
├── services/                      # Backend microservices
│   ├── auth/                      # Authentication & authorization
│   ├── users/                     # User management
│   ├── billing/                   # Billing & claims
│   ├── notifications/             # Email, SMS, push
│   └── files/                     # File/image management
│
├── packages/                      # Shared packages
│   ├── ui/                        # Shared UI components (React)
│   ├── sdk/                       # Client SDK
│   ├── types/                     # Shared TypeScript types
│   ├── config/                    # Shared configuration
│   └── utils/                     # Shared utilities
│
├── infrastructure/                # IaC and deployment
│   ├── docker/                    # Docker Compose + Dockerfiles
│   ├── terraform/                 # AWS infrastructure (VPC module)
│   ├── kubernetes/                # K8s manifests
│   └── helm/                      # Helm charts
│
├── docs/                          # All documentation
│   ├── architecture/              # Schema, agent guide, Redis patterns
│   ├── ux/                        # Voice UX, undo patterns
│   ├── market/                    # Market analysis
│   ├── api/                       # API documentation
│   ├── security/                  # Security guidelines
│   ├── deployment/                # Deployment guide
│   └── contributing/              # Contribution guide, style guide
│
├── scripts/                       # Shell automation (73 scripts)
├── tests/                         # Test suites (e2e, integration, load)
├── monitoring/                    # Prometheus, Grafana, Fluentd, alerts
├── analytics/                     # Event schemas
├── tools/                         # Code generators
│
├── Makefile                       # 60+ orchestration commands
├── package.json                   # Root monorepo config (pnpm + turbo)
├── turbo.json                     # Turborepo pipeline
├── tsconfig.json                  # Root TypeScript config
└── pnpm-workspace.yaml            # Workspace definition
```

---

## Security Architecture (Designed)

| Layer           | Mechanism                                                                 | Status             |
| --------------- | ------------------------------------------------------------------------- | ------------------ |
| Authentication  | JWT (RS256) + Refresh tokens + MFA (TOTP)                                 | Documented         |
| Authorization   | RBAC/ABAC hybrid with permission keys                                     | Schema defined     |
| Multi-tenancy   | Row-level security via `tenant_id` on all tables                          | Schema defined     |
| Data Protection | AES-256 at rest, TLS 1.3 in transit, field-level PHI encryption           | Documented         |
| Audit           | Immutable `audit_events` table, time-partitioned                          | Schema defined     |
| API Security    | Rate limiting, input validation (Zod), security headers                   | Documented         |
| AI Safety       | Human-in-the-loop approvals, agent interventions, PHI protection triggers | Schema defined     |
| Secrets         | AWS Secrets Manager, secret rotation scripts                              | Partially scripted |

---

## Data Flow: Voice Command to Clinical Action

```
Dentist speaks → Microphone → WebSocket → ASR Engine
       │
       ▼
Voice Session Created (voice_sessions)
       │
       ▼
Utterance Transcribed (voice_utterances) → Intent + Entities extracted
       │
       ▼
Agent Workflow Triggered (agent_executions)
       │
       ├── Step 1: Parse Intent (LLM_CALL → GPT-4) → agent_steps
       ├── Step 2: Retrieve Context (TOOL_CALL → get_patient_history) → tool_executions
       ├── Step 3: Generate Content (LLM_CALL → GPT-4) → agent_steps
       ├── Step 4: Execute Action (TOOL_CALL → create_clinical_note) → tool_executions
       │   └── If requires_approval → agent_approval_requests → Dentist confirms
       │
       ▼
Clinical Data Written (clinical_notes, dental_chart, etc.)
       │
       ├── action_history recorded (5-min undo window)
       ├── audit_events logged
       └── agent_metrics recorded
```

---

## Environment Matrix

| Environment    | Infrastructure  | Database                | Cache                       | Storage           | AI/LLM          |
| -------------- | --------------- | ----------------------- | --------------------------- | ----------------- | --------------- |
| **Local**      | Docker Compose  | Postgres 16 (container) | Redis 7 (container)         | MinIO (container) | LocalStack mock |
| **Staging**    | AWS (Terraform) | RDS PostgreSQL          | ElastiCache Redis           | S3                | OpenAI API      |
| **Production** | AWS (Terraform) | RDS PostgreSQL (HA)     | ElastiCache Redis (cluster) | S3 (multi-region) | OpenAI API      |

---

## CI/CD Pipeline (Configured)

```
Push to Branch → GitHub Actions CI
    ├── Lint (prettier + eslint)
    ├── Format check
    ├── Unit tests (with coverage → Codecov)
    ├── Integration tests (Postgres + Redis services)
    └── Build all packages

Merge to main → Deploy Staging
    ├── Build Docker images per service
    ├── Push to container registry
    ├── Terraform plan + apply (staging)
    ├── Run migrations
    └── Smoke tests

Manual trigger → Deploy Production
    ├── Same as staging with production tfvars
    ├── Blue/green deployment
    └── Rollback capability
```
