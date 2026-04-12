# Roadmap & Next Steps

## From Documentation to Working Product

**Date:** April 12, 2026

---

## Phased Implementation Plan

### Phase 0: Foundation Fix (Week 1) — Fix What's Broken

**Goal:** Make the existing scaffold actually work.

| Task                                                                           | Effort  | Priority |
| ------------------------------------------------------------------------------ | ------- | -------- |
| Fix ESLint configuration (create `eslint.config.js`)                           | 2 hours | P0       |
| Create `.env.example` with all required variables                              | 2 hours | P0       |
| Fix pnpm-lock.yaml (run `pnpm install` properly)                               | 1 hour  | P0       |
| Create `scripts/build/` directory and implement build scripts                  | 3 hours | P0       |
| Fix DB password mismatch in `local/start.sh`                                   | 30 min  | P0       |
| Fix region inconsistency in `validate-region.sh`                               | 30 min  | P0       |
| Implement critical stub scripts (docker start/stop, db migrate)                | 4 hours | P0       |
| Create missing `lib/aws.sh` or remove reference                                | 1 hour  | P1       |
| Delete references to non-existent docs (IMPLEMENTATION_STATUS.md, COMPLETE.md) | 30 min  | P1       |

---

### Phase 1: Core Foundation (Weeks 2-4)

**Goal:** Database running, types generated, auth working, basic API responding.

```
Week 2: Database + Shared Packages
├── Generate DDL from schema YAML → create migration files
├── Set up Drizzle ORM with schema definitions
├── Run migrations → all 25+ core tables created
├── Create packages/types from schema YAML
├── Create packages/config (env loading, DB config, Redis config)
├── Create packages/utils (validation, date formatting, ID generation)
└── Verify: `make db-migrate` creates all tables

Week 3: Auth Service
├── Create services/auth with Fastify
├── Implement: Registration, login, logout
├── Implement: JWT issuance + refresh token rotation
├── Implement: Redis session management (from Redis patterns doc)
├── Implement: RBAC middleware (roles + permissions)
├── Implement: Multi-tenant context (tenant_id scoping)
├── Create Dockerfile for auth service
└── Verify: Can register, login, get JWT, access protected routes

Week 4: API Gateway + User Service
├── Create apps/api-gateway with Fastify
├── Implement: JWT validation middleware
├── Implement: Request routing to services
├── Implement: Rate limiting (Redis-based, from Redis patterns doc)
├── Create services/users (CRUD, tenant membership)
├── Implement: WebSocket upgrade handler (for future voice)
└── Verify: Full auth flow through gateway → services → DB
```

**Milestone 1: Authentication & multi-tenant API working end-to-end**

---

### Phase 2: Dental Core (Weeks 5-8)

**Goal:** Patient management, dental charting, clinical notes — all via API.

```
Week 5: Patient Management
├── Implement patient CRUD in user service (or new clinical service)
├── Patient search (by name, DOB, tenant-scoped)
├── Encounter creation and management
├── Clinical notes CRUD (SOAP notes)
└── Verify: Create patient, create encounter, write clinical note

Week 6: Dental Charting & Treatment Plans
├── Implement dental chart data model (tooth-level entries)
├── Implement treatment plan CRUD (plan + items)
├── CDT code reference data loading
├── Treatment plan cost estimation
└── Verify: Full dental chart workflow via API

Week 7: Web App Foundation
├── Create apps/web with Next.js 15 + shadcn/ui + Tailwind
├── Implement: Login page + auth flow
├── Implement: Dashboard layout (sidebar, header, navigation)
├── Implement: Patient list view
├── Implement: Patient detail view with dental chart
├── Create packages/ui with shared components
└── Verify: Can login, see patients, view dental chart in browser

Week 8: Clinical Note UI + File Uploads
├── Implement: Clinical note creation/editing UI
├── Implement: Treatment plan view/creation UI
├── Set up services/files for image upload (MinIO/S3)
├── Implement: Basic image upload and viewing
├── Implement: Encounter workflow (check-in → exam → check-out)
└── Verify: Full clinical workflow in browser
```

**Milestone 2: Working dental practice management (no voice yet)**

---

### Phase 3: AI Voice Agent — THE CORE PRODUCT (Weeks 9-14)

**Goal:** Dentist can speak commands and the system executes them.

```
Week 9: Voice Infrastructure
├── Create voice agent service (Fastify + WebSocket)
├── Integrate Deepgram Nova-3 streaming ASR
├── Implement audio pipeline: browser → WebSocket → Deepgram → transcript
├── Implement VAD (Silero) for turn detection
├── Voice session management (create/end sessions)
├── Store utterances in voice_utterances table
└── Verify: Speak into mic → see real-time transcript in UI

Week 10: Intent & Entity Extraction
├── Implement LLM-based intent parser (GPT-4.1-mini)
├── Define dental intent taxonomy (chart_update, create_note, schedule, etc.)
├── Implement entity extraction (tooth numbers, procedures, diagnoses)
├── Build confidence scoring system
├── Create intent → workflow mapping
└── Verify: "Mark tooth 14 as missing" → intent: chart_update, tooth: 14, status: missing

Week 11: LangGraph Workflow Engine
├── Integrate LangGraph with agent service
├── Implement first workflow: Voice → Parse → Extract → Confirm → Execute
├── Connect agent_workflows, agent_executions, agent_steps tables
├── Implement tool registry (agent_tools table)
├── Create first tools: get_patient_history, update_dental_chart
├── Implement state checkpointing
└── Verify: Voice command → workflow runs → dental chart updated

Week 12: Voice Confirmation & HITL
├── Implement 3-tier confirmation system (Quick/Standard/Critical)
├── Build voice confirmation UI components
├── Implement approval request flow (agent_approval_requests)
├── Build approval UI for dentists
├── Implement escalation on timeout
├── Connect confirmation to voice session (approve by voice: "confirm")
└── Verify: "Extract tooth 28" → critical confirmation → approve → chart updated

Week 13: Undo & Safety
├── Implement action_history recording for all mutations
├── Build undo mechanism with 5-minute window
├── Implement undo toast UI with countdown timer
├── Implement cascading undo (e.g., undo note also undoes related chart entry)
├── Implement agent_interventions recording
├── Add voice command: "Undo" / "Undo last action"
└── Verify: Execute command → say "undo" within 5 minutes → action reversed

Week 14: Voice Agent Polish
├── Implement TTS for agent responses (voice feedback)
├── Add voice waveform visualizer to UI
├── Implement ambient listening mode (always-on mic with VAD)
├── Handle multiple commands in sequence
├── Handle interruptions and corrections
├── Performance optimization (target: <3s voice-to-action)
└── Verify: Full chairside workflow — voice commands during exam
```

**Milestone 3: Voice-first dental charting working end-to-end**

---

### Phase 4: AI Intelligence Layer (Weeks 15-18)

**Goal:** Multi-agent collaboration, RAG, imaging AI, smart suggestions.

```
Week 15: RAG & Memory
├── Set up pgvector extension and indexes
├── Implement embedding pipeline (patient notes → vectors)
├── Build context window assembly (agent_context_windows)
├── Implement agent memory CRUD (agent_memories)
├── Semantic search for patient history retrieval
├── Context-aware responses (agent remembers preferences)
└── Verify: Agent uses past visit history in responses

Week 16: Multi-Agent Collaboration
├── Implement agent conversation management
├── Create specialized agents:
│   ├── Diagnostic Agent (analyzes findings)
│   ├── Treatment Planning Agent (generates plans)
│   ├── Insurance Agent (checks coverage)
│   └── Scheduling Agent (books appointments)
├── Implement supervisor pattern (hierarchical collaboration)
├── Build agent-to-agent messaging
└── Verify: "Create comprehensive treatment plan" → 4 agents collaborate → plan generated

Week 17: Imaging AI Integration
├── Integrate dental X-ray AI model (caries detection)
├── Implement AI inference job pipeline
├── Build radiograph viewer with AI overlays (Cornerstone.js)
├── Confidence-based color coding (green/yellow/orange)
├── Accept/dismiss findings workflow
├── Store AI predictions linked to patient records
└── Verify: Upload X-ray → AI detects caries → dentist reviews overlays

Week 18: Smart Suggestions & Analytics
├── Implement proactive suggestions during encounters
├── Build practice analytics dashboard
├── LLM cost tracking dashboard (from agent_metrics)
├── Workflow performance analytics
├── Patient communication templates (AI-generated)
└── Verify: During exam, agent proactively suggests based on patient history
```

**Milestone 4: Full AI-powered dental practice platform**

---

### Phase 5: Production Readiness (Weeks 19-22)

**Goal:** Secure, scalable, monitored, ready for first customers.

```
Week 19: Infrastructure
├── Implement Terraform modules (Aurora, ElastiCache, S3, ECS)
├── Set up staging environment on AWS
├── Configure CI/CD pipeline (working end-to-end)
├── Set up secrets management (AWS Secrets Manager)
├── Configure SSL certificates (ACM + CloudFront)
└── Verify: Deploy to staging via git push

Week 20: Security & Compliance
├── Implement Row-Level Security (RLS) in PostgreSQL
├── Security audit of all API endpoints
├── Implement HIPAA audit logging
├── Set up field-level encryption for PHI
├── Penetration testing
├── BAA agreements with LLM/ASR vendors
└── Verify: Pass security checklist

Week 21: Monitoring & Observability
├── Instrument all services with OpenTelemetry
├── Set up LangSmith for AI observability
├── Configure alerting (PagerDuty/Slack)
├── Build operational dashboards (Grafana)
├── Implement health check endpoints
├── Set up error tracking (Sentry)
└── Verify: Can monitor full request lifecycle

Week 22: Testing & Quality
├── Achieve 80%+ unit test coverage on critical paths
├── Integration test suite for all API endpoints
├── E2E test suite (Playwright) for key user flows
├── Voice-specific test suite (golden transcripts)
├── Load testing (k6) — target 100 concurrent users
├── Performance benchmarks documented
└── Verify: All tests passing in CI
```

**Milestone 5: Production-ready platform**

---

### Phase 6: Launch & Growth (Weeks 23+)

```
├── Beta launch with 2-3 dental practices
├── Implement billing service (Stripe integration)
├── Build admin dashboard for practice management
├── Build notification service (appointment reminders)
├── Mobile app (React Native) for on-the-go access
├── Multi-language support (starting with Spanish)
├── Insurance claim submission integration
├── Practice analytics and reporting
├── Patient portal (self-scheduling, records access)
└── SOC 2 Type II certification
```

---

## Priority Matrix

```
                          HIGH IMPACT
                             │
     ┌───────────────────────┼───────────────────────┐
     │                       │                        │
     │  Auth Service     Voice Agent Core        │
     │  Database Setup       │  Multi-Agent System    │
     │  API Gateway          │  RAG Pipeline          │
     │  Web App UI           │  Imaging AI            │
     │                       │                        │
LOW ─┼───────────────────────┼────────────────────────┼─ HIGH
EFFORT│                      │                        │  EFFORT
     │  Fix Scaffolding     │  Mobile App            │
     │  ESLint Config       │  Admin Dashboard       │
     │  .env.example        │  SOC 2 Certification   │
     │  Build Scripts        │  Multi-language        │
     │                       │                        │
     └───────────────────────┼───────────────────────┘
                             │
                          LOW IMPACT
```

---

## Risk Mitigation

| Risk                                            | Mitigation                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| LLM hallucinations in clinical context          | Mandatory HITL for mutations + confidence thresholds                   |
| Voice recognition errors in noisy dental office | Dental-specific vocabulary tuning + confirmation before execution      |
| HIPAA violation from LLM data exposure          | BAA with vendors + no raw PHI in prompts + encrypted logs              |
| Performance (voice-to-action latency)           | Streaming ASR + fast model routing + edge caching                      |
| Cost overrun on LLM API usage                   | Per-tenant token budgets + model routing (cheap for simple tasks)      |
| Single developer bottleneck                     | Prioritize MVP features, defer nice-to-haves                           |
| Technology lock-in                              | Abstract LLM/ASR behind interfaces, use standards (OpenTelemetry, OCI) |

---

## Success Metrics

| Metric                     | Target              | How to Measure                         |
| -------------------------- | ------------------- | -------------------------------------- |
| Voice-to-action latency    | <3 seconds          | agent_metrics (COMPLETION_TIME)        |
| Voice command accuracy     | >95% correct intent | Compare intent vs user correction rate |
| Workflow completion rate   | >95%                | agent_executions (COMPLETED/total)     |
| Human intervention rate    | <5%                 | agent_interventions count / total      |
| System uptime              | 99.9%               | Health check monitoring                |
| User satisfaction          | >4.5/5              | In-app feedback                        |
| LLM cost per interaction   | <$0.05              | agent_metrics (TOKEN_COST)             |
| Time saved per dentist/day | >30 minutes         | Usage analytics                        |
