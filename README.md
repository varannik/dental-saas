# Dental Platform

Voice-first clinical records, with a separate evidence service for the thesis question-answering system. The design is in [docs/specification.md](docs/specification.md) and the build order is in [docs/implementation-plan.md](docs/implementation-plan.md).

## Layout

- `apps/web` — Next.js client
- `apps/api` — Fastify core API
- `apps/evidence` — Python evidence service
- `packages/contracts` — permission keys and error codes shared by the API and the client
- `packages/db` — database schema and migrations
- `packages/config` — shared TypeScript settings and the licence allow-list checker
- `infra/compose` — local data services

Lint, format and TypeScript settings are carried over from `dental-saas`.

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm licence:check
pnpm stack:up
pnpm db:migrate                          # as the owner, DATABASE_MIGRATION_URL
pnpm --filter @dental/api db:seed        # Demo Dental clinic, one user per role
pnpm e2e                                 # Playwright: a full session by click, local stack
pnpm --filter @dental/api auth:keygen    # prints AUTH_PRIVATE_KEY and MFA_ENCRYPTION_KEY lines
pnpm --filter @dental/api audit:verify   # recomputes every clinic's audit chain
pnpm --filter @dental/api clinic:onboard --name "Tehran Smile" --country IR \
  --currency IRR --timezone Asia/Tehran --locale fa-IR --admin owner@example.com
```

`pnpm stack:up` starts PostgreSQL 16 (pgvector), Valkey 8, SeaweedFS and Neo4j, and waits until every health check is green. `pnpm stack:down` stops them.

| Service          | Address from the host                                                |
| ---------------- | -------------------------------------------------------------------- |
| PostgreSQL       | `postgresql://postgres:postgres@localhost:5433/dental`               |
| Application role | `postgresql://app:app@localhost:5433/dental`                         |
| Valkey           | `redis://localhost:6380`                                             |
| SeaweedFS S3     | `http://localhost:8333` with access key `dev` and secret `devsecret` |
| Neo4j            | `bolt://localhost:7687` user `neo4j`, password `devpassword`         |

The API listens on port 4000. The web app listens on port 3000.

The API connects as the `app` role, which cannot bypass row-level security, and refuses to start on a superuser connection. Sign-in runs through `SECURITY DEFINER` functions owned by the `dental_auth` role, because it happens before a clinic is chosen. The seeded users share the password `dental-dev-password`; for example `dentist@demo.test` signs in with `POST /v1/auth/login`. Dentists, managers and administrators also need a TOTP code: their first sign-in returns a secret to add to an authenticator app, and `POST /v1/auth/mfa/verify` takes the challenge token and the code. Locally, `pnpm --filter @dental/api auth:totp <secret>` prints the current code.

`pnpm test` includes the clinic-isolation test, which starts PostgreSQL through Docker. Pull requests run the same checks, plus the licence gate, in GitHub Actions. A dependency whose licence is not on the allow-list fails the build.

`pnpm e2e` runs the end-to-end tests against the local stack: the database must be up and migrated, and the API and web app are started unless they already run on 4000 and 3000. Each run seeds its own clinic and dentist (`pnpm --filter @dental/api e2e:seed`) and enrols the authenticator itself, so runs never share data. The first time, install the browser with `pnpm --filter @dental/web exec playwright install chromium`. The end-to-end tests are not part of CI yet.

Production targets Node.js 22. Development works on Node.js 20 or newer.

## Signing in on the web

With the API and the web app running, open http://localhost:3000 and sign in, for example as `dentist@demo.test` with `dental-dev-password`. Dentists, managers and administrators set up an authenticator app at their first sign-in (the page shows a QR code) and enter a code after that; members of several clinics choose one. The access token stays in memory and the refresh token in an httpOnly cookie, so a reload restores the session; refreshes are serialised across tabs.

## Onboarding a clinic

Clinics are onboarded by an operator with `clinic:onboard`, which runs as the database owner and goes through the command bus as the system actor, so the onboarding is a recorded command and the first entries of the clinic's audit chain. Each clinic chooses its country, regulatory profile (`--profile`, default `standard`), language, currency, time zone and tooth notation (`--notation`, FDI only for now). The first administrator gets a one-time password, printed once, and sets up an authenticator app at first sign-in. An existing account is added as administrator and keeps its password. No clinic role can onboard clinics, and there is no HTTP route for it.

## Patients

`GET /v1/patients?q=` finds patients by name, phone digits or file number. Names match with trigram similarity on a normalised form (no Latin accents, one Persian form per letter) and with Double Metaphone codes, so "Sarah Ahmad" finds "Sara Ahmed". `POST /v1/patients` warns with `409 possible_duplicate` and the candidates when the national ID matches, or the date of birth or phone matches with a similar name; send `"force": true` after reviewing them. The national ID is encrypted (`DATA_ENCRYPTION_KEY`) and never appears in clear in the command log or the audit trail. Every search and profile read is recorded in `audit.access_log`. Patients are archived, never deleted.

## Medical history

`GET /v1/patients/:id/history` returns a patient's allergies, conditions, medications and risk factors (add `?includeEnded=true` for ended entries). Reading it needs `patient.read` and `session.read`, so receptionists see no clinical content. `POST /v1/patients/:id/history/:kind` adds an entry (`allergy`, `condition`, `medication`, `risk_factor`) and `POST /v1/patients/:id/history/:entryId/end` ends one as resolved, stopped or entered in error. Entries are never edited or deleted; a database trigger enforces this. Active allergies show as alerts in the patient banner. See [ADR 0002](docs/adr/0002-history-model-and-access.md).

## Sessions and the chart

`POST /v1/sessions` opens a patient's session (one open session per patient); `POST /v1/sessions/:id/findings`, `/perio` and `/notes` record the examination, and `/complete` closes it. Findings use language-neutral codes from `FINDINGS` in `packages/contracts/src/chart.ts`, on FDI teeth and their surfaces (M, O or I, D, B, L). The tooth chart is event-sourced: each finding appends to `clinical.chart_events` and updates the `clinical.chart_entries` projection in the same transaction, and `rebuildChart` re-derives the projection from the events alone. `GET /v1/patients/:id/chart?history=true` returns the chart with every event. Findings, events, readings and notes are insert-only; a correction is a new finding that supersedes the old one.

## Diagnoses

Assistants suggest diagnoses (`POST /v1/sessions/:id/diagnoses`, status `suggested`); only dentists record confirmed ones and confirm, reject or retract (`PATCH /v1/diagnoses/:id`). Each action is its own command with its own permission (`diagnosis.suggest`, `diagnosis.write`), so the command bus refuses an assistant's confirmation before anything runs. A database trigger allows only suggested to confirmed or rejected, and confirmed to retracted (with a reason). Codes are listed in `DIAGNOSIS_CODES`; a diagnosis without a tooth covers the whole mouth.

## Treatment plans

`GET /v1/procedure-types` lists the procedure catalog: 26 generic procedures under language-neutral codes (not CDT, which is licensed; see [ADR 0003](docs/adr/0003-procedure-catalog-and-plans.md)). A patient has at most one open plan (`POST /v1/patients/:id/plans`). Items go at the end or after another item (`POST /v1/plans/:id/items` with `afterItemId`); `POST /v1/plans/:id/reorder` takes every item id in the new order with the plan's version, and the sequence stays 1..n. Items are cancelled, not deleted; plans move proposed, accepted, completed, or to cancelled. A procedure on a tooth charted as missing is refused unless it replaces a tooth.

## Procedures, sign-off and amendments

A dentist starts a procedure in an open session from a planned item, or ad hoc with a procedure code (`POST /v1/sessions/:id/procedures`), then completes or cancels it (`PATCH /v1/procedures/:id`). Completing marks the plan item done, completes an accepted plan once no planned items remain, and charts the result (a filling as a restoration on its surfaces, a root canal, crown, extraction or implant on the tooth). A session with a procedure in progress cannot be completed.

`POST /v1/sessions/:id/sign` signs a completed session; it is dentist-only and risk R3, so never by voice alone. A signed session is locked in the database: triggers refuse any insert or update of its findings, chart events, perio, notes, diagnoses and procedures, also for the owner. The only way in is `POST /v1/sessions/:id/amendments` (dentist, a reason, and up to 20 actions among `note.add`, `finding.add`, `diagnosis.record` and `diagnosis.retract`). It runs in one transaction, each action under its own permission, and every row it writes carries the amendment id.

## The workspace

Every clinical screen shares one frame: the patient banner (coloured while a session is open), the session strip (time, the procedure in progress with its timer, the selected tooth), the workspace, the activity rail and the voice bar. The dashboard (`GET /v1/dashboard`) lists the clinic's open sessions to resume and the patients you opened recently; a receptionist sees no sessions. The activity rail (`GET /v1/activity`) lists your last ten executed commands and refreshes after each one; Undo arrives with the voice layer.

## Voice

Clinicians with `voice.use` (dentists and assistants) see a voice bar at the bottom of every screen: hold the button or the space bar to talk. While it is held, speech (not silence) streams to `WS /v1/voice/stream`. The socket authenticates with a single-use, 30-second ticket from `POST /v1/voice/tickets`, sent as a WebSocket subprotocol. If the network drops, speech is kept and sent once the connection is back, and the stream resumes where it stopped. The design is in [ADR 0004](docs/adr/0004-voice-transport.md). Speech becomes commands from V2 on; until then the bar shows what the server heard.

## Writing data

Every state change is a command, and the command bus (`apps/api/src/modules/commands/bus.ts`) is the only write path. It validates the payload against the registry in `packages/contracts/src/commands.ts`, checks the permission, then runs the handler, writes the command row (`voice.commands`) and the audit entries (`audit.audit_log`) in one transaction scoped to the clinic. REST routes only translate HTTP into commands; voice will confirm proposals into the same commands.

- Writes need an `Idempotency-Key` header. A retry with the same key and body returns the first answer, with `idempotent-replayed: true`; the same key with a different body is refused with `idempotency_key_reused`.
- The audit log is insert-only and hash-chained per clinic. Each entry's hash covers its content and the previous hash, so an edited or deleted entry breaks the chain, which `audit:verify` reports.
- To add a command: define it (type, payload schema, permission, risk tier) in `packages/contracts`, write a handler that returns its result and the changes for the audit log, register it, and add a route that calls `bus.execute`. Include an inverse for undo where one exists, the GUI entry, utterance examples and tests.
