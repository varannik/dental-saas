# Best Practices & Modern Technology Recommendations

## AI Voice Assistant for Dental SaaS — 2026 Technology Landscape

**Date:** April 12, 2026

---

## 1. Voice & Speech Technology (2026 State of the Art)

### Automatic Speech Recognition (ASR)

| Technology                          | Best For                           | Latency | Accuracy | Cost               |
| ----------------------------------- | ---------------------------------- | ------- | -------- | ------------------ |
| **Deepgram Nova-3**                 | Real-time streaming, medical terms | <300ms  | 98%+     | $0.0043/min        |
| **OpenAI Whisper (large-v3-turbo)** | Batch transcription, multilingual  | 1-5s    | 97%+     | Self-hosted or API |
| **Google Chirp 2**                  | Streaming + medical vocabulary     | <500ms  | 97%+     | $0.016/min         |
| **AssemblyAI Universal-2**          | Real-time + speaker diarization    | <500ms  | 97%+     | $0.01/min          |

**Recommendation for this project:** **Deepgram Nova-3** for real-time streaming (low latency critical for chairside use) with custom medical vocabulary. Fall back to Whisper for batch audio processing and compliance recording.

### Text-to-Speech (TTS) for Agent Responses

| Technology                       | Quality    | Latency           | Notes                            |
| -------------------------------- | ---------- | ----------------- | -------------------------------- |
| **ElevenLabs Turbo v3**          | Near-human | <200ms first byte | Best voice quality, streaming    |
| **OpenAI TTS (gpt-4o-mini-tts)** | Good       | <300ms            | Integrated with OpenAI ecosystem |
| **Cartesia Sonic 2**             | High       | <100ms first byte | Ultra-low latency                |
| **Google Cloud TTS**             | Good       | <200ms            | Medical pronunciation models     |

**Recommendation:** **ElevenLabs** for voice quality or **Cartesia** for ultra-low latency. For MVP, OpenAI TTS integrates cleanly with the existing LLM pipeline.

### Voice Activity Detection (VAD)

**Silero VAD** — Open source, runs locally, sub-millisecond. Essential for knowing when the dentist starts/stops speaking. Combine with WebSocket streaming for real-time turn detection.

---

## 2. LLM & AI Agent Architecture (2026 Best Practices)

### LLM Selection Strategy

| Use Case                               | Recommended Model                        | Why                                             |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Intent parsing / classification        | **GPT-4.1-mini** or **Claude 3.5 Haiku** | Fast, cheap, accurate for structured extraction |
| Clinical note generation               | **GPT-4.1** or **Claude 4 Sonnet**       | Strong medical knowledge, structured output     |
| Complex reasoning (treatment planning) | **Claude 4 Opus** or **GPT-4.1**         | Deep reasoning for clinical decisions           |
| Embeddings (RAG)                       | **OpenAI text-embedding-3-large**        | 3072-dim, high quality, affordable              |
| On-premise / privacy-sensitive         | **Llama 3.3 70B** or **Mistral Large**   | Self-hosted, HIPAA control                      |

**Best Practice: Use a model router** — Route different tasks to different models based on complexity, latency requirements, and cost. Your schema already supports tracking `llm_provider` and `llm_model` per step.

### Agent Framework: LangGraph (Confirmed Best Choice)

Your architecture already targets LangGraph, which remains the best choice in 2026 for:

- **State machine workflows** — Perfect for clinical voice command flows
- **Human-in-the-loop** — Native support for approval nodes
- **Checkpointing** — Resume long-running workflows
- **Streaming** — Token-by-token streaming to the UI
- **Multi-agent** — Supervisor + specialist agent patterns

**2026 LangGraph Best Practices:**

```
1. Use LangGraph Cloud for managed deployment (or self-host with Redis checkpointer)
2. Implement "interrupt_before" for all clinical mutation nodes
3. Use streaming mode for real-time feedback during voice interactions
4. Store state snapshots in PostgreSQL (your schema already supports this)
5. Version workflows explicitly (your schema has version field)
6. Use LangSmith for observability (traces, costs, latency monitoring)
```

### RAG Architecture for Dental Knowledge

```
Patient Context Assembly Pipeline:

1. Query: Voice utterance + current encounter context
2. Retrieve from pgvector: Patient memories, preferences, history
3. Retrieve from clinical knowledge base: CDT codes, protocols, drug interactions
4. Rerank: Cohere Rerank v3 or cross-encoder
5. Assemble context window: Priority-based (critical allergies first)
6. Generate: LLM call with assembled context

Technology Stack:
- pgvector (already in your schema) for patient-specific vectors
- Pinecone or Weaviate for large clinical knowledge base
- Cohere Rerank for result quality
- LangChain for orchestration
```

---

## 3. Real-Time Communication Architecture

### WebSocket Strategy for Voice Streaming

```
Browser/App → WebSocket → API Gateway → Voice Agent Service

Recommended: Socket.IO with Redis adapter for:
- Automatic reconnection (critical for chairside use)
- Binary frame support (audio chunks)
- Room-based routing (per voice session)
- Horizontal scaling via Redis pub/sub
```

**Modern Alternative: WebTransport** (HTTP/3 based)

- Lower latency than WebSocket
- Built-in multiplexing
- Browser support maturing in 2026
- Consider as upgrade path

### Audio Pipeline Best Practice

```
Client Side:
1. MediaRecorder API → Opus codec @ 16kHz mono
2. VAD (Silero) → Only send when speech detected
3. Chunk size: 100-250ms for real-time feel
4. Send via WebSocket binary frames

Server Side:
1. Receive audio chunks
2. Stream to ASR (Deepgram streaming API)
3. Receive partial transcripts → show in UI immediately
4. On final transcript → trigger intent parsing
5. Stream LLM response back → TTS → audio to client
```

---

## 4. Frontend Architecture Best Practices

### Framework: Next.js 15 App Router

Your choice of Next.js is correct. 2026 best practices:

| Pattern          | Recommendation                                                              |
| ---------------- | --------------------------------------------------------------------------- |
| Rendering        | Server Components by default, Client Components for interactive parts       |
| State            | Zustand (lightweight) or Jotai (atomic) — avoid Redux overhead              |
| Forms            | React Hook Form + Zod validation (matches your backend validation)          |
| Data Fetching    | TanStack Query v5 for server state, SWR for simpler cases                   |
| UI Library       | **shadcn/ui** (best for custom medical UIs) + Tailwind CSS v4               |
| Dental Chart     | Custom SVG/Canvas component or adapt open-source dental charting lib        |
| Radiology Viewer | Cornerstone.js 3 (DICOM viewer, actively maintained)                        |
| Real-time        | Socket.IO client for voice streaming + server-sent events for notifications |
| Testing          | Vitest + Testing Library + Playwright                                       |

### Voice-First UI Best Practices

```
1. Large touch targets (min 48x48px) for gloved hands
2. High contrast mode for bright operatory lighting
3. Voice feedback indicator (always visible waveform/pulse)
4. Persistent undo toast (bottom corner, 5-min countdown)
5. Confirmation cards: slide-in from right, auto-dismiss on confirm
6. AI confidence badges: color-coded (green/yellow/orange)
7. Minimal text input: voice should handle 90%+ of interactions
8. Quick-action floating buttons for common voice-alternative actions
```

---

## 5. Backend Architecture Best Practices

### Service Framework: Fastify (Confirmed Best Choice)

| Feature           | Fastify Advantage                                               |
| ----------------- | --------------------------------------------------------------- |
| Performance       | 2-3x faster than Express                                        |
| Schema validation | Built-in JSON Schema validation (aligns with your Zod approach) |
| TypeScript        | First-class support                                             |
| Plugins           | Modular architecture matches microservice pattern               |
| WebSocket         | `@fastify/websocket` for voice streaming                        |

### Database Access: Drizzle ORM (Recommended over Prisma for this project)

| Criteria      | Drizzle                             | Prisma                           |
| ------------- | ----------------------------------- | -------------------------------- |
| SQL control   | Full SQL, no abstraction leaks      | Generated queries, less control  |
| Performance   | Closer to raw SQL                   | Slightly slower due to engine    |
| Type safety   | Excellent, SQL-like                 | Excellent, model-based           |
| Migrations    | SQL-first, version control friendly | Prisma Migrate, separate tooling |
| pgvector      | Native support                      | Requires extensions/workarounds  |
| Multi-tenancy | Easy `WHERE tenant_id = ?`          | Requires middleware              |
| Bundle size   | Tiny                                | Large (Rust engine binary)       |

**Recommendation:** Drizzle ORM — better for pgvector, multi-tenant queries, and the level of SQL control needed for complex dental/AI queries in your schema.

### API Design: tRPC + REST Hybrid

```
Internal services (app ↔ API gateway ↔ services):
  → tRPC for type-safe, fast internal communication
  → End-to-end type safety from DB to UI

External/public API:
  → REST with OpenAPI spec
  → Versioned (/api/v1/...)
  → Used by mobile app, third-party integrations
```

---

## 6. Security Best Practices for Healthcare AI

### HIPAA Compliance Essentials

| Requirement               | Implementation                                                   |
| ------------------------- | ---------------------------------------------------------------- |
| PHI encryption at rest    | PostgreSQL TDE or field-level encryption (pgcrypto)              |
| PHI encryption in transit | TLS 1.3 everywhere, mTLS between services                        |
| Access logging            | `audit_events` table (already designed) + CloudWatch             |
| BAA with vendors          | Required for OpenAI, Deepgram, any cloud LLM provider            |
| Minimum necessary         | Context windows should only include relevant patient data        |
| Data retention            | Configurable per tenant, automatic archival (schema supports it) |
| Breach notification       | Automated alert pipeline, 72-hour requirement                    |

### AI-Specific Security

```
1. Never store raw PHI in LLM prompts/logs — use patient_id references
2. Implement prompt injection protection on voice transcripts
3. Validate all LLM outputs against clinical schemas before execution
4. Rate limit LLM calls per tenant to prevent cost attacks
5. Audit every agent action (your schema already supports this)
6. Implement model output validation: confidence thresholds before auto-execution
7. Regular red-team testing of voice commands for adversarial inputs
8. Store LLM interaction logs encrypted, separate from clinical data
```

### Authentication Best Practice: Session-Based + JWT Hybrid

```
Web App: HttpOnly cookie sessions (stored in Redis)
  - Eliminates XSS token theft
  - Automatic CSRF protection with SameSite=Strict
  - Your Redis session pattern already designed for this

API/Mobile: Short-lived JWT (15min) + Refresh token rotation
  - Access token in memory only (never localStorage)
  - Refresh token in HttpOnly cookie or secure storage
  - Token blacklisting via Redis (your schema supports this)

Service-to-Service: mTLS + API client credentials
  - api_clients table (already designed)
  - Scoped permissions per agent/service
```

---

## 7. Infrastructure Best Practices (2026)

### Container Orchestration: ECS Fargate over EKS (for this scale)

For a dental SaaS startup, EKS is overkill. Consider:

| Option              | Pros                                        | Cons                         | Recommendation           |
| ------------------- | ------------------------------------------- | ---------------------------- | ------------------------ |
| **ECS Fargate**     | No cluster management, pay-per-use, simpler | Less portable                | Best for MVP/early stage |
| **EKS**             | Full K8s, portable, rich ecosystem          | Complex, expensive base cost | Better at scale          |
| **Cloud Run** (GCP) | Simplest, scale-to-zero                     | GCP lock-in                  | Alternative if not AWS   |

**Recommendation:** Start with **ECS Fargate** for simplicity. Your Terraform can target ECS. Migrate to EKS when you need advanced scheduling, service mesh, or multi-cloud.

### Database: Aurora Serverless v2 (over plain RDS)

- Auto-scales compute (0.5 to 128 ACUs)
- Pay-per-use (great for dental practices with off-hours)
- pgvector extension supported
- Automatic failover
- Compatible with standard PostgreSQL client

### Caching: Valkey / ElastiCache Serverless

AWS now offers ElastiCache Serverless (Valkey/Redis compatible):

- No capacity planning needed
- Auto-scales based on demand
- Same Redis commands your patterns already use

### CDN & Edge

```
CloudFront → API Gateway (ALB) → ECS Services
     │
     └── Edge caching for static assets (Next.js)
         Edge functions for auth token validation
         WebSocket upgrade passthrough
```

---

## 8. Observability Best Practices

### OpenTelemetry (Standard for 2026)

```
All services instrument with OpenTelemetry SDK:
  → Traces: Distributed tracing across voice → agent → DB
  → Metrics: Request latency, error rate, LLM token usage
  → Logs: Structured JSON, correlated with trace IDs

Export to:
  → AWS X-Ray (if staying AWS-native)
  → Grafana Cloud (Tempo + Loki + Mimir) — better dashboards
  → Datadog (if budget allows) — best all-in-one
```

### AI-Specific Observability

```
LangSmith (LangChain ecosystem):
  → Trace every LLM call, tool execution, agent step
  → Track token costs per tenant, per workflow
  → Identify slow/failing workflows
  → A/B test prompt variations

Custom metrics (your agent_metrics table):
  → Workflow completion rate (target: >95%)
  → Average voice-to-action latency (target: <5 seconds)
  → Human intervention rate (target: <3%)
  → LLM cost per interaction (track and optimize)
  → User satisfaction scores
```

---

## 9. Testing Best Practices for AI Voice Systems

### Testing Pyramid for Voice AI

```
                    /\
                   /  \  E2E Voice Tests
                  / 10 \ (Playwright + recorded audio)
                 /------\
                / Integ  \ Integration Tests
               /   20%    \ (API + DB + LLM mocks)
              /------------\
             /   Unit Tests  \
            /      70%        \ (Pure functions, tools, validators)
           /------------------\
```

### Voice-Specific Testing

```
1. Golden transcript tests: Known audio → expected intent + entities
2. Accent variation tests: Different accents → same clinical meaning
3. Noise resilience tests: Background dental drill noise → accurate transcription
4. Dental vocabulary tests: CDT codes, tooth numbering, procedure names
5. Confirmation flow tests: Voice → confirm → execute → verify DB state
6. Undo flow tests: Execute → undo within window → verify rollback
7. Concurrent session tests: Multiple dentists in same practice
8. Approval timeout tests: HITL timeout → escalation flow
```

### LLM Testing Strategy

```
1. Deterministic tests: Pin model + temperature=0 for reproducible tests
2. Evaluation sets: Curated set of dental voice commands with expected outputs
3. Regression testing: Track output quality across model updates
4. Cost monitoring tests: Assert token usage stays within budget per workflow
5. Safety tests: Verify high-risk commands always trigger approval
6. Prompt injection tests: Adversarial transcripts should be caught
```

---

## 10. Development Workflow Best Practices

### Branch Strategy

```
main (production)
  └── develop (staging)
       ├── feature/voice-agent-core
       ├── feature/auth-service
       ├── feature/web-dental-chart
       └── fix/websocket-reconnect

PR → develop: Auto-deploy to staging
develop → main: Manual approval → deploy to production
```

### Monorepo Development

```
pnpm workspace commands:
  pnpm --filter @dental/auth dev       # Run single service
  pnpm --filter @dental/web dev        # Run single app
  pnpm --filter "./services/*" test    # Test all services
  turbo run build --filter=...[HEAD~1] # Build only changed packages
```

### Code Generation from Schema

```
schema-core.yaml → generate:
  1. SQL DDL (CREATE TABLE statements)
  2. Drizzle schema definitions (TypeScript)
  3. Zod validation schemas
  4. OpenAPI type definitions
  5. TypeScript interfaces (packages/types)

This single-source-of-truth approach keeps everything synchronized.
```

---

## Summary of Key Technology Decisions

| Decision          | Current Plan       | Recommendation                            | Change?         |
| ----------------- | ------------------ | ----------------------------------------- | --------------- |
| Frontend          | Next.js            | Next.js 15 + shadcn/ui + Tailwind v4      | Upgrade version |
| Backend           | Fastify            | Fastify 5 + tRPC internal                 | Add tRPC        |
| ORM               | Not chosen         | Drizzle ORM                               | New decision    |
| LLM               | OpenAI GPT-4       | Multi-model (GPT-4.1 + Claude) via router | Expand          |
| ASR               | Not chosen         | Deepgram Nova-3 (streaming)               | New decision    |
| TTS               | Not chosen         | ElevenLabs or OpenAI TTS                  | New decision    |
| Agent Framework   | LangGraph          | LangGraph (confirmed)                     | Keep            |
| Embeddings        | OpenAI             | OpenAI text-embedding-3-large             | Keep            |
| Vector DB         | pgvector           | pgvector + Pinecone for knowledge base    | Expand          |
| State Management  | Not chosen         | Zustand                                   | New decision    |
| Container Runtime | EKS                | ECS Fargate (start) → EKS (scale)         | Change          |
| Database (prod)   | RDS                | Aurora Serverless v2                      | Change          |
| Observability     | Prometheus/Grafana | OpenTelemetry + LangSmith                 | Expand          |
| Auth              | JWT only           | Session + JWT hybrid                      | Expand          |
