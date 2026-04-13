# What's Missing - Gap Analysis

**Date:** April 12, 2026

---

## Critical Missing Pieces (Blocking Any Demo/MVP)

### 1. Application Source Code — NOTHING EXISTS

The entire `apps/`, `services/`, and `packages/` directories contain only README placeholders. There is zero TypeScript/JavaScript application code in the current repo.

**Impact:** Cannot run any feature, cannot demo anything, cannot test anything meaningful.

| Missing Component                                              | Priority | Estimated Effort |
| -------------------------------------------------------------- | -------- | ---------------- |
| `packages/types` — Shared TypeScript types from schema YAML    | P0       | 2-3 days         |
| `packages/config` — Shared environment/database config         | P0       | 1 day            |
| `packages/utils` — Common utilities (validation, formatting)   | P0       | 2 days           |
| `services/auth` — JWT auth, sessions, RBAC/ABAC                | P0       | 1-2 weeks        |
| `apps/api-gateway` — Request routing, rate limiting, WebSocket | P0       | 1 week           |
| `services/users` — User CRUD, tenant management                | P0       | 1 week           |
| `apps/web` — Next.js dental practice interface                 | P0       | 3-4 weeks        |
| `services/billing` — Insurance claims, payments                | P1       | 2-3 weeks        |
| `services/notifications` — Email, SMS, push                    | P1       | 1 week           |
| `services/files` — Image/DICOM upload and management           | P1       | 1-2 weeks        |
| `packages/ui` — Shared React component library                 | P1       | 2-3 weeks        |
| `packages/sdk` — Client SDK for API consumption                | P2       | 1 week           |
| `apps/admin` — System admin dashboard                          | P2       | 2 weeks          |
| `apps/mobile` — React Native mobile app                        | P3       | 4-6 weeks        |

---

### 2. Database Migrations — SCHEMA NOT DEPLOYED

The schema exists only as YAML documentation. No SQL DDL has been generated, no migration tool is configured, and no actual tables exist in the database.

**Missing:**

- [ ] DDL generation script (`scripts/generate/ddl.sh` is a stub)
- [ ] Migration framework (e.g., Drizzle, Prisma, or node-pg-migrate)
- [ ] Migration files for core schema (25+ tables)
- [ ] Migration files for agent extensions (13+ tables)
- [ ] Seed data for development and testing
- [ ] pgvector extension setup for RAG/embeddings
- [ ] Locale/language schema rollout (tenant defaults, supported locales, voice locale columns)
- [ ] Language-aware indexes for RAG metadata (content_language + scope filters)

---

### 3. AI Voice Agent — CORE PRODUCT NOT BUILT

The AI voice agent IS the product, and it doesn't exist yet. Only the schema and architecture docs exist.

**Missing:**

- [ ] Voice capture service (WebSocket server for real-time audio streaming)
- [ ] ASR integration (Deepgram, Whisper, or Google Speech-to-Text)
- [ ] Intent/entity extraction (LLM-based NLU)
- [ ] LangGraph workflow engine integration
- [ ] Agent tool registry and execution framework
- [ ] Multi-agent collaboration runtime
- [ ] RAG pipeline (embeddings → pgvector → context assembly)
- [ ] Human-in-the-loop approval UI and API
- [ ] Undo/rollback mechanism with 5-minute window
- [ ] Voice confirmation system (3-tier: quick, standard, critical)
- [ ] Language routing layer (input locale → ASR model, output locale → TTS voice)
- [ ] Persian normalization pipeline (character variants + numeral normalization)
- [ ] RTL UI support for transcripts/confirmations in Persian locale

---

### 4. ESLint Configuration — MISSING

`lint-staged` in `package.json` calls `eslint --fix` but there is no `.eslintrc`, `eslint.config.js`, or any ESLint configuration file. The pre-commit hook will fail on any TypeScript file.

---

### 5. `.env.example` — MISSING

No environment variable template exists. Developers have no reference for required environment variables across services.

---

## Infrastructure Gaps

### Terraform Modules (Only VPC Exists)

| Module            | Status                                           | Needed For               |
| ----------------- | ------------------------------------------------ | ------------------------ |
| VPC + Subnets     | **Partial** (VPC created, subnets return `[]`)   | Everything               |
| RDS PostgreSQL    | Commented out, module doesn't exist              | Database                 |
| ElastiCache Redis | Commented out, module doesn't exist              | Sessions/cache           |
| S3 Buckets        | Commented out, module doesn't exist              | File storage             |
| EKS Cluster       | Commented out, module doesn't exist              | Container orchestration  |
| IAM Roles         | Not defined                                      | Service permissions      |
| CloudFront / ALB  | Not defined                                      | CDN / load balancing     |
| Route53           | Not defined                                      | DNS                      |
| ACM               | Not defined                                      | SSL certificates         |
| WAF               | Not defined                                      | Web application firewall |
| Secrets Manager   | Not defined (only script for generating secrets) | Secret storage           |

### Docker Infrastructure

| Item                                              | Status                                      |
| ------------------------------------------------- | ------------------------------------------- |
| `Dockerfile` per service                          | **Missing** (only `Dockerfile.base` exists) |
| `docker-compose.dev.yml` for running app services | **Missing**                                 |
| Multi-stage build optimization                    | **Missing**                                 |
| Docker build caching strategy                     | **Missing**                                 |

### Kubernetes

| Item                                      | Status                                         |
| ----------------------------------------- | ---------------------------------------------- |
| Actual deployments matching real services | **Missing** (templates use placeholder images) |
| Horizontal Pod Autoscaler                 | **Missing**                                    |
| Network policies                          | **Missing**                                    |
| PersistentVolumeClaims                    | **Missing**                                    |
| Service mesh (Istio/Linkerd)              | **Missing**                                    |

---

## DevOps Gaps

### Shell Scripts (61 of 73 are stubs)

**Critical stubs that block development:**

| Script                        | Blocks               |
| ----------------------------- | -------------------- |
| `scripts/docker/start.sh`     | Local development    |
| `scripts/docker/stop.sh`      | Local development    |
| `scripts/database/migrate.sh` | Database setup       |
| `scripts/database/seed.sh`    | Test data            |
| `scripts/dev/start.sh`        | Development workflow |
| `scripts/test/run-all.sh`     | Testing              |
| `scripts/quality/lint.sh`     | Code quality         |
| `scripts/build/build-all.sh`  | Building             |
| `scripts/ci/test.sh`          | CI pipeline          |

### Missing `scripts/build/` directory

The Makefile references `scripts/build/build-all.sh`, `scripts/build/build-services.sh`, and `scripts/build/build-docker.sh` but the `scripts/build/` directory doesn't exist.

---

## Testing Gaps

| Layer              | Status                      | Missing                                |
| ------------------ | --------------------------- | -------------------------------------- |
| Unit tests         | No test runner installed    | Vitest config, test utilities, mocks   |
| Integration tests  | Skeleton helpers exist      | Actual test cases, test database setup |
| E2E tests          | Playwright config exists    | Actual test scenarios, CI integration  |
| Load tests         | k6 scripts exist (skeleton) | Realistic scenarios, baseline metrics  |
| API contract tests | Nothing                     | OpenAPI spec, contract test framework  |
| Visual regression  | Nothing                     | Storybook, Chromatic or similar        |

---

## Documentation Gaps (Minor)

| Document                             | Status                       |
| ------------------------------------ | ---------------------------- |
| `IMPLEMENTATION_STATUS.md`           | Referenced but doesn't exist |
| `COMPLETE.md`                        | Referenced but doesn't exist |
| `.env.example` with all variables    | Doesn't exist                |
| API OpenAPI/Swagger spec             | Not generated from schema    |
| Runbook for production operations    | Not created                  |
| Architecture Decision Records (ADRs) | Not started                  |
| Data flow diagrams per service       | Not created                  |
| Performance benchmarks / targets     | Not documented               |

---

## Monitoring & Observability Gaps

| Component           | Status             | Missing                                    |
| ------------------- | ------------------ | ------------------------------------------ |
| Prometheus config   | Template exists    | Actual service metrics endpoints           |
| Grafana dashboards  | 1 overview JSON    | Per-service dashboards, AI agent dashboard |
| Fluentd config      | Template exists    | Log format standardization, parsing rules  |
| Alert rules         | Template YAML      | Real thresholds, escalation policies       |
| Distributed tracing | Nothing            | OpenTelemetry integration                  |
| Error tracking      | Nothing            | Sentry or similar                          |
| Uptime monitoring   | Nothing            | Health check endpoints, status page        |
| LLM cost monitoring | Schema supports it | Dashboard, budget alerts                   |

---

## Security Gaps

| Area                                          | Status                                |
| --------------------------------------------- | ------------------------------------- |
| Row-level security (RLS) policies in Postgres | Designed, not implemented             |
| API rate limiting implementation              | Documented, not coded                 |
| Input validation schemas (Zod)                | Documented, not coded                 |
| CORS configuration                            | Not configured                        |
| CSP headers implementation                    | Documented, not coded                 |
| Secret rotation automation                    | Script exists but untested            |
| Penetration testing                           | Not started                           |
| HIPAA compliance validation                   | Requirements documented, not verified |
| SOC 2 Type II preparation                     | Not started                           |
| Data encryption at field level                | Designed, not implemented             |

---

## Summary: Implementation Effort Estimate

| Category                             | Estimated Effort         | Status                     |
| ------------------------------------ | ------------------------ | -------------------------- |
| Core packages (types, config, utils) | 1-2 weeks                | Not started                |
| Database migrations + seeding        | 1 week                   | Not started                |
| Auth service                         | 2 weeks                  | Not started                |
| API Gateway                          | 1 week                   | Not started                |
| User service                         | 1 week                   | Not started                |
| Web app (dental practice UI)         | 4-6 weeks                | Not started                |
| AI Voice Agent (core product)        | 6-8 weeks                | Not started                |
| Billing service                      | 2-3 weeks                | Not started                |
| File/imaging service                 | 2 weeks                  | Not started                |
| Infrastructure (Terraform modules)   | 2-3 weeks                | Partially started          |
| CI/CD pipeline (working)             | 1 week                   | Templates exist            |
| Testing framework + initial tests    | 2 weeks                  | Skeleton exists            |
| Monitoring & observability           | 1-2 weeks                | Templates exist            |
| **Total estimated to MVP**           | **~20-26 weeks (1 dev)** | **~8-12 weeks (2-3 devs)** |
