# Implementation Plan

Oct 1, 2026 · @Reza

## Review findings

The specification holds up on a second pass with seven changes; two of them replace components that do not meet the open-source rule.

| #   | Finding                                                                                                    | Change                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Redis 7.4 and later 7.x releases moved to source-available licences                                        | Use **Valkey 8** (BSD-3-Clause), the Linux Foundation fork. It is wire-compatible, so BullMQ and the context store work unchanged                                                                                       |
| 2   | MinIO's community edition has been cut back and is no longer a safe base for new builds                    | Use **SeaweedFS** (Apache-2.0) through its S3-compatible API. Application code talks to an S3 interface only, so the store can be swapped. Confirm the current state of both projects when the stack is first installed |
| 3   | Voice latency through external APIs was the least-proven number in the spec and was first tested in week 9 | A two-day voice spike moves to week 2: microphone to transcript to proposed command, measured end to end                                                                                                                |
| 4   | A regulatory profile that forbids external AI was said to disable voice only                               | It must also disable the Evidence Assistant for that clinic, since generation uses an external LLM                                                                                                                      |
| 5   | Embeddings and contradiction detection could have depended on an external provider                         | Both use open-weight models that run on the CPU server, so retrieval and novelty 1 are reproducible without any provider. Only answer generation calls an external LLM                                                  |
| 6   | Tasks 57 to 62, added from your decisions, sat outside the phases                                          | They are folded into the milestones below                                                                                                                                                                               |
| 7   | Several components are copyleft: Neo4j Community (GPLv3), Grafana and Loki (AGPLv3), k6 (AGPLv3)           | All are run unmodified as separate services or tools, which places no obligation on your own code. Review this if you ever modify or redistribute them                                                                  |

### What is not a package

The open-source rule applies to everything installed and run. Three things are hosted services that you chose and that have no package to license: Vercel for the frontend, GitHub for source, CI and the container registry, and the external speech and LLM APIs. Each sits behind a boundary that an open-source alternative can replace: the Next.js build also runs on the Ubuntu server, CI is plain shell scripts, and the AI adapters accept self-hosted models.

## Open-source stack

Every installed component below is under an OSI-approved licence. Licences are stated as I know them; a licence check in CI (work package F8) verifies them from the lockfiles before anything ships.

### Frontend

| Package                           | Licence          | Job                                          |
| --------------------------------- | ---------------- | -------------------------------------------- |
| Next.js, React                    | MIT              | Application framework                        |
| TypeScript                        | Apache-2.0       | Language                                     |
| Tailwind CSS, shadcn/ui, Radix UI | MIT              | Styling and accessible components            |
| TanStack Query                    | MIT              | Server state                                 |
| Zustand                           | MIT              | Session and voice state                      |
| next-intl                         | MIT              | Message catalogues, right-to-left support    |
| openapi-typescript, openapi-fetch | MIT              | Typed API client generated from the contract |
| Silero VAD with ONNX Runtime Web  | MIT              | Voice-activity detection in the browser      |
| Web Audio and Web Speech APIs     | Browser standard | Capture and spoken confirmations             |

### Core API and worker

| Package                                                                          | Licence    | Job                                                                                                          |
| -------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| Node.js                                                                          | MIT        | Runtime                                                                                                      |
| Fastify, @fastify/websocket, @fastify/rate-limit, @fastify/helmet, @fastify/cors | MIT        | HTTP and WebSocket server                                                                                    |
| Zod, fastify-type-provider-zod                                                   | MIT        | Validation and OpenAPI generation                                                                            |
| Drizzle ORM, drizzle-kit                                                         | Apache-2.0 | Schema, migrations, queries                                                                                  |
| node-postgres (`pg`)                                                             | MIT        | PostgreSQL driver                                                                                            |
| BullMQ, ioredis                                                                  | MIT        | Job queues on Valkey                                                                                         |
| argon2, jose, otplib                                                             | MIT        | Password hashing, token signing, TOTP                                                                        |
| Vercel AI SDK                                                                    | Apache-2.0 | Provider-agnostic LLM calls with tool use for the interpreter                                                |
| decimal.js                                                                       | MIT        | Exact money and quantity arithmetic                                                                          |
| pino                                                                             | MIT        | Structured logs                                                                                              |
| prom-client, OpenTelemetry SDK                                                   | Apache-2.0 | Metrics and traces                                                                                           |
| S3 protocol client: `minio` JavaScript client or `@aws-sdk/client-s3`            | Apache-2.0 | Talks to SeaweedFS over the S3 protocol. The SDK is a library, not an AWS service; pick whichever you prefer |

### Evidence service and Research Lab

| Package                                                    | Licence                              | Job                                                                               |
| ---------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Python, FastAPI, Pydantic, Uvicorn                         | PSF, MIT, MIT, BSD-3-Clause          | Service                                                                           |
| neo4j Python driver                                        | Apache-2.0                           | Graph queries                                                                     |
| psycopg, pgvector client                                   | LGPL-3.0, MIT                        | Knowledge tables and vectors                                                      |
| sentence-transformers, Transformers, PyTorch (CPU build)   | Apache-2.0, Apache-2.0, BSD-3-Clause | Embeddings and natural-language inference                                         |
| Open-weight embedding model, for example BGE-M3            | MIT                                  | Multilingual chunk and query vectors                                              |
| Open-weight NLI model, for example a DeBERTa-v3 MNLI model | MIT                                  | Pairwise contradiction labels for novelty 1                                       |
| LiteLLM                                                    | MIT                                  | Provider-agnostic generator calls, pinned per pipeline version                    |
| LlamaIndex (optional)                                      | MIT                                  | Chunking and extraction helpers; the pipeline stages themselves are your own code |
| Ragas                                                      | Apache-2.0                           | Automatic faithfulness and context relevance                                      |
| scikit-learn, SciPy, statsmodels, pandas                   | BSD-3-Clause                         | Calibration error, tests, intervals, effect sizes, agreement                      |
| Presidio, spaCy                                            | MIT                                  | De-identification of free text in exports                                         |
| pytest, Ruff, uv                                           | MIT, MIT, Apache-2.0 or MIT          | Tests, lint, dependency management                                                |

### Data and infrastructure

| Component                                        | Licence               | Job                                                 |
| ------------------------------------------------ | --------------------- | --------------------------------------------------- |
| Ubuntu Server 24.04 LTS                          | Mixed open source     | Host                                                |
| Docker Engine and Compose plugin                 | Apache-2.0            | Containers (the Engine, not Docker Desktop)         |
| PostgreSQL 16, pgvector, pg\_trgm, fuzzystrmatch | PostgreSQL Licence    | Records, vectors, fuzzy and phonetic patient search |
| Neo4j Community                                  | GPLv3                 | Knowledge graph                                     |
| Valkey                                           | BSD-3-Clause          | Context, queues, rate limits                        |
| SeaweedFS                                        | Apache-2.0            | Object storage                                      |
| Caddy                                            | Apache-2.0            | TLS and reverse proxy                               |
| WireGuard, UFW, fail2ban                         | GPL family            | Private admin access and host hardening             |
| pgBackRest, restic                               | MIT, BSD-2-Clause     | Database and object backups                         |
| SOPS, age                                        | MPL-2.0, BSD-3-Clause | Encrypted secrets                                   |
| Prometheus, Alertmanager, exporters              | Apache-2.0            | Metrics and alerts                                  |
| Grafana, Loki, Promtail                          | AGPLv3                | Dashboards and logs                                 |
| GlitchTip                                        | MIT                   | Error tracking                                      |

### Build and test

| Tool                          | Licence           | Job                        |
| ----------------------------- | ----------------- | -------------------------- |
| pnpm, Turborepo               | MIT               | Monorepo                   |
| ESLint, Prettier, Husky       | MIT               | Code quality               |
| Vitest, Testcontainers        | MIT               | Unit and integration tests |
| Playwright                    | Apache-2.0        | End-to-end tests           |
| k6                            | AGPLv3            | Load tests                 |
| OWASP ZAP, Trivy              | Apache-2.0        | Security and image scans   |
| license-checker, pip-licenses | BSD-3-Clause, MIT | Licence gate in CI         |

### Later, when a GPU is added

faster-whisper (MIT) for speech-to-text and an open-weight LLM served by vLLM (Apache-2.0) or Ollama (MIT) plug into the existing adapters with no change to commands, handlers or tests.

## Build order

The build takes about 30 weeks for two engineers, with the thesis track starting in week 3 and finishing its evaluation by week 24, before hardening begins.

| Milestone                | Track   | Weeks (estimate) |
| ------------------------ | ------- | ---------------- |
| F Foundation             | Product | 1 to 4           |
| C Clinical core          | Product | 5 to 10          |
| V Voice layer            | Product | 9 to 16          |
| M Materials and cost     | Product | 11 to 16         |
| T Corpus and graph       | Thesis  | 3 to 10          |
| T Baselines              | Thesis  | 8 to 13          |
| T Two mechanisms         | Thesis  | 12 to 18         |
| T Evaluation runs        | Thesis  | 17 to 24         |
| T Assistant in clinic UI | Thesis  | 23 to 25         |
| H Hardening              | Product | 22 to 27         |
| L Validation and launch  | Product | 26 to 30         |

Voice and materials overlap because both need only the clinical core. The thesis track touches the product once, when the assistant is embedded in the clinic UI. Durations are estimates; the order is what matters.

## Milestones

Each milestone ends in something that runs on staging and passes a stated check; nothing counts as done on a developer machine. Work packages are in build order. Codes: F foundation, C clinical, V voice, M materials, T thesis, H hardening, L launch.

### F — Foundation (weeks 1–4)

| ID  | Work package              | Deliverable                                                                                            | Acceptance check                                                                           |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| F1  | Monorepo and tooling      | `apps/web`, `apps/api`, `apps/evidence`, `packages/db`, `packages/contracts`; lint, format, type-check | `pnpm build` and `pnpm test` pass from a clean clone                                       |
| F2  | Local stack               | Compose file with PostgreSQL, Valkey, SeaweedFS, Neo4j                                                 | One command starts everything; health checks green                                         |
| F3  | Config and platform       | Validated environment loading, logging, error format, request ids                                      | API refuses to start on a missing variable                                                 |
| F4  | Core schema and isolation | Clinics, regulatory profiles, users, memberships, roles; row-level security                            | Test proves clinic B reads zero rows of clinic A on every table                            |
| F5  | Identity                  | argon2id login, refresh rotation, TOTP, lockout                                                        | Reused refresh token revokes the family                                                    |
| F6  | Command bus and audit     | Registry, validation, permission check, transaction, idempotency, hash-chained audit                   | A retried command returns the first result; audit row commits with the write or not at all |
| F7  | Voice spike               | Microphone to transcript to proposed command for one intent, with stage timings                        | Round-trip measured on real audio; go or no-go on the 2-second target and provider choice  |
| F8  | CI and licence gate       | Tests, scans, licence allow-list on every pull request                                                 | A dependency with a non-approved licence fails the build                                   |
| F9  | Staging                   | Ubuntu server with Caddy, WireGuard, firewall, systemd unit; Vercel project                            | A signed-in user runs one audited command on staging                                       |
| F10 | Clinic onboarding         | Create clinic with country, profile, locale, currency, timezone, tooth notation                        | Two clinics with different settings coexist on staging                                     |

### C — Clinical core (weeks 5–10)

| ID  | Work package            | Deliverable                                                               | Acceptance check                                                |
| --- | ----------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| C1  | Patients                | Create, edit, fuzzy and phonetic search, duplicate warning, access log    | A misspelt name finds the patient; every profile read is logged |
| C2  | History                 | Conditions, medications, allergies, risk factors                          | Ending an entry keeps its history                               |
| C3  | Session and examination | Sessions, findings per tooth and surface, chart with events, perio, notes | Chart state rebuilds from events                                |
| C4  | Diagnosis               | Suggested and confirmed states                                            | An assistant role cannot confirm                                |
| C5  | Planning                | Plans, ordered items, procedure catalog seeded                            | Items reorder and keep sequence                                 |
| C6  | Procedures and sign-off | Start, complete, session summary, sign, amendment                         | Any write to a signed session fails except through an amendment |
| C7  | Screens                 | Persistent frame; screens 2 to 9 and 12                                   | Playwright completes and signs a full session by click          |

### V — Voice layer (weeks 9–16)

| ID  | Work package          | Deliverable                                                                          | Acceptance check                                                                                               |
| --- | --------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| V1  | Audio transport       | Capture worklet, voice-activity detection, ticketed WebSocket                        | Stream survives a network blip; unauthenticated socket is refused                                              |
| V2  | Speech adapter        | English provider behind the adapter; vocabulary biasing                              | Word error rate on a recorded dental phrase set meets the bar set in F7                                        |
| V3  | Context store         | Focus stack, pending proposal, context version in Valkey                             | Changing patient clears focus and pending proposals                                                            |
| V4  | Interpreter           | Tool definitions generated from the command registry; prompt versions; text endpoint | Model output outside the registry is rejected                                                                  |
| V5  | Resolvers             | Patient, tooth notation, catalog aliases, numbers and units                          | "Tooth sixteen" resolves by the clinic's notation                                                              |
| V6  | Risk and confirmation | Tiers R0 to R3, proposal, edit, expiry, undo                                         | No R2 or R3 command executes without confirmation in any test                                                  |
| V7  | Voice UI              | Voice bar, proposal card, activity rail, spoken replies                              | Fields taken from context are labelled as such                                                                 |
| V8  | Coverage              | Voice for every clinical command; dictation mode                                     | The brief's three-utterance example passes                                                                     |
| V9  | Utterance corpus      | Per-locale test set in CI; provider data-processing review                           | Intent and entity accuracy above the agreed bar; a voice session and a click session produce identical records |

### M — Materials and cost (weeks 11–16)

| ID  | Work package             | Deliverable                                                               | Acceptance check                                            |
| --- | ------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| M1  | Catalog                  | Categories, units, suppliers, materials, translation tables               | A material is found by an alias in its locale               |
| M2  | Price versions           | Insert-only prices with validity periods and exclusion constraint         | Overlapping periods are rejected by the database            |
| M3  | Templates                | Versioned expected materials; frozen copy at procedure start              | Editing a template leaves started procedures unchanged      |
| M4  | Usage                    | Unit conversion, price lookup at time of use, snapshot, wastage, reversal | Usage without a valid price is refused                      |
| M5  | Traceability             | Lot, serial, expiry on traceable materials; per-patient list              | Voice asks for the lot number before confirming an implant  |
| M6  | Cost views               | Procedure, session and patient totals with variance                       | Totals equal hand-calculated fixtures exactly               |
| M7  | Management panel         | Materials, price timeline with author and reason, templates, CSV import   | A price change leaves every earlier session total identical |
| M8  | Voice for usage and cost | Usage and cost intents; screens 10, 11, 13                                | "How much have we spent so far?" reads the session total    |

### T — Thesis track (weeks 3–25)

| ID  | Work package               | Deliverable                                                                                        | Acceptance check                                                        |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| T1  | Corpus                     | Source checklist, credibility metadata, cleaning, chunking, embeddings                             | Every chunk traces to a source with a credibility level                 |
| T2  | Knowledge graph            | Schema validated by a dental expert; triples with chunk and source links; review screen            | Reviewed sample meets the agreed triple precision                       |
| T3  | Research isolation         | Separate database role; pseudonymised export; identifier-leak test                                 | Pipeline output is identical under different random pseudonyms          |
| T4  | Baselines                  | LLM only, Text-RAG, base GraphRAG behind one pipeline interface                                    | All three answer the same question through the same API                 |
| T5  | Novelty 1                  | Consistency matrix, evidence score, selection                                                      | Contradiction rate is computed and falls on seeded conflicting evidence |
| T6  | Novelty 2                  | Confidence score, thresholds, three-tier policy                                                    | Insufficient-evidence items produce abstention                          |
| T7  | Evaluation set             | Questions with reference answers, challenge types, validation and test splits                      | Experts validate the set; tuning jobs cannot read the test split        |
| T8  | Runner and versions        | Frozen pipeline versions, snapshots, model benchmark and pin                                       | A run is reproducible from its version id                               |
| T9  | Judgement                  | Claim decomposition, blinded expert review with overlap                                            | Inter-rater agreement is reported                                       |
| T10 | Results                    | Six metrics with intervals and effect sizes; ablation A to D on the locked test set                | Results export as tables and charts for the thesis                      |
| T11 | Assistant in the clinic UI | Evidence screen and `evidence.ask` intent; disabled where the clinic's profile forbids external AI | An answer shows sources and tier and writes nothing to the record       |

### H — Hardening (weeks 22–27)

| ID  | Work package      | Deliverable                                                                   | Acceptance check                                                            |
| --- | ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| H1  | Production server | Encrypted volume, hardened host, deploy and rollback scripts                  | Rollback to the previous image digest works                                 |
| H2  | Backups           | pgBackRest, restic, Neo4j dumps, off-site copy                                | A scheduled restore on staging passes integrity checks and reports its time |
| H3  | Observability     | Dashboards, alerts, uptime checks, error tracking                             | Each alert is triggered once on purpose and received                        |
| H4  | Security          | Role-by-permission matrix tests, scans, external penetration test             | Findings closed or accepted in writing                                      |
| H5  | Load and failure  | 50 concurrent sessions; AI provider and database outages                      | Voice degrades to GUI; no data loss                                         |
| H6  | Runbooks          | Deploy, rollback, restore, key rotation, incident response, clinic onboarding | A second person completes each from the document alone                      |

### L — Validation and launch (weeks 26–30)

| ID  | Work package       | Deliverable                                              | Acceptance check                                      |
| --- | ------------------ | -------------------------------------------------------- | ----------------------------------------------------- |
| L1  | Clinical scenarios | Scripted sessions with clinicians, by voice and by click | A dentist signs off the resulting records             |
| L2  | Voice usability    | Completion rate, corrections per session, time per step  | Results reviewed; blocking issues fixed               |
| L3  | Go-live            | First clinic onboarded on production                     | Checklist complete; backups and alerts confirmed live |

## First two weeks

The first ten working days produce a deployed skeleton and an answer on voice latency, the two things every later decision rests on.

1. **Day 1.** Create the new repository and monorepo (F1). Copy lint, format and TypeScript settings from `dental-saas`. Write the licence allow-list.
2. **Day 2.** Local Compose stack (F2) and validated configuration (F3).
3. **Days 3–4.** Core schema with row-level security and the cross-clinic isolation test (F4). Port the reusable tenancy tables from the old repository.
4. **Day 5.** CI with tests, scans and the licence gate (F8).
5. **Days 6–7.** Voice spike (F7): browser capture, one speech provider, one intent, timings per stage. Decide the provider and confirm or revise the 2-second target.
6. **Day 8.** Login and token handling (F5, first half).
7. **Days 9–10.** Command bus with one real command, audit in the same transaction (F6). Provision the staging server and connect Vercel (F9).

In parallel from day 1 on the thesis track: agree the source inclusion checklist with your supervisors and start collecting the corpus (T1). It needs no code and is the longest lead-time item.

## Working rules

These rules keep the three architectural requirements from eroding during the build.

- **Definition of done.** Merged to `main`, deployed to staging, acceptance check automated where possible, audit and permission tests included, user-facing strings in the message catalogue.
- **One write path.** A pull request that writes clinical data outside a command handler is rejected. A lint rule forbids database writes from route and voice modules.
- **New command checklist.** Schema in `packages/contracts`, permission key, risk tier, handler, inverse for undo if any, GUI entry, utterance examples per locale, tests.
- **Dependency policy.** New dependencies need an approved licence (MIT, BSD, Apache-2.0, ISC, MPL-2.0, PostgreSQL; GPL and AGPL only for standalone services and tools), active maintenance, and a pinned version. The CI gate enforces the licence part.
- **Branching.** Short-lived branches, pull requests with one review, squash merge, releases by tag.
- **Migrations.** Forward-only and backward-compatible for one release; insert-only tables never get an update path.
- **Prompts and models are code.** Interpreter prompts and research pipeline settings are versioned files; a change runs the utterance corpus or creates a new pipeline version.
- **Thesis freeze.** Metric definitions and the test split are locked before T10. Production serves a frozen pipeline version.
- **Decision records.** Any departure from the specification is a short record in `docs/adr`, linked from the pull request.
