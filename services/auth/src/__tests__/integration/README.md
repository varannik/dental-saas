# Auth integration tests

These hit a **real** auth HTTP server and (optionally) Postgres/Redis via the helpers — they are not mocked.

## Prerequisites

1. **Postgres** running and migrated — same connection as **`DATABASE_URL`** for the vitest process (defaults and overrides: `services/auth/vitest.config.ts`, `.env`, `.env.test`).
2. **Redis** reachable at `REDIS_URL` / `TEST_REDIS_URL` when the session layer needs it (same URL the in-process app uses).

Integration suites default to an **in-process** Fastify app (`buildServer()` + `inject()`), so you do **not** need a separate auth daemon on port 4001 unless you opt into `AuthTestClient` manually.

The helper `setupIntegrationData()` inserts the demo tenant by ID (`TEST_TENANT_ID` or default). If that insert fails (wrong DB URL, Postgres down), you’ll see a console warning; registration may then fail with a foreign-key or Drizzle error.

## Environment

| Variable                             | Purpose                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `RUN_INTEGRATION_TESTS`              | Must be `true` for tests to run (see `package.json` scripts).                                   |
| `TEST_API_URL`                       | Only for **`AuthTestClient`** (HTTP to an external server). Default inject client ignores this. |
| `TEST_TENANT_ID`                     | Tenant UUID for register/login (must exist or be seeded by helpers).                            |
| `TEST_DATABASE_URL` / `DATABASE_URL` | Used by helpers for tenant seed and cleanup.                                                    |

## Reading failures

Assertions use `assertHttpStatus()` from `helpers.ts`. On mismatch, the error includes the **full JSON body** from the auth service. A common pattern is:

```json
{
  "statusCode": 500,
  "message": "Failed query: select \"id\" from \"users\" ..."
}
```

That usually means the **auth process** cannot run that query against Postgres (connection, migration, or permissions). After restarting auth with the fix that chains `error.cause`, the `message` field often includes the driver text (e.g. `relation "users" does not exist`).

`beforeAll` runs **`assertIntegrationDatabaseReady()`**, which checks that `public.users` exists (via `TEST_DATABASE_URL` → `DATABASE_URL`, then the default from `services/auth/vitest.config.ts`). With **`AuthInjectClient`**, HTTP handling runs in-process, so Postgres/Redis match the vitest worker. If you still see `Failed query`, confirm migrations and env for that database.

## Commands

```bash
TEST_TENANT_ID=11111111-1111-4111-8111-111111111111 pnpm --filter @saas/auth test:integration
TEST_TENANT_ID=11111111-1111-4111-8111-111111111111 pnpm --filter @saas/auth test:contract
```
