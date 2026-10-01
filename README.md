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

`pnpm test` includes the clinic-isolation test, which starts PostgreSQL through Docker. Pull requests run the same checks, plus the licence gate, in GitHub Actions. A dependency whose licence is not on the allow-list fails the build.

Production targets Node.js 22. Development works on Node.js 20 or newer.
