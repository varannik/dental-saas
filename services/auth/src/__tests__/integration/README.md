# Auth integration tests

These hit a **real** auth HTTP server and (optionally) Postgres/Redis via the helpers — they are not mocked.

## Prerequisites

1. **Postgres** running and migrated (same database the auth service uses).
2. **Auth service** listening on `TEST_API_URL` (default `http://localhost:4001`).
3. **Redis** if sessions use it — same URL as the running auth app (`REDIS_URL` / `TEST_REDIS_URL`).

The helper `setupIntegrationData()` inserts the demo tenant by ID (`TEST_TENANT_ID` or default). If that insert fails (wrong DB URL, Postgres down), you’ll see a console warning; registration may then fail with a foreign-key or Drizzle error.

## Environment

| Variable                             | Purpose                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| `RUN_INTEGRATION_TESTS`              | Must be `true` for tests to run (see `package.json` scripts).        |
| `TEST_API_URL`                       | Auth base URL (default `http://localhost:4001`).                     |
| `TEST_TENANT_ID`                     | Tenant UUID for register/login (must exist or be seeded by helpers). |
| `TEST_DATABASE_URL` / `DATABASE_URL` | Used by helpers for tenant seed and cleanup.                         |

## Reading failures

Assertions use `assertHttpStatus()` from `helpers.ts`. On mismatch, the error includes the **full JSON body** from the auth service. A common pattern is:

```json
{
  "statusCode": 500,
  "message": "Failed query: select \"id\" from \"users\" ..."
}
```

That usually means the **auth process** cannot run that query against Postgres (connection, migration, or permissions). After restarting auth with the fix that chains `error.cause`, the `message` field often includes the driver text (e.g. `relation "users" does not exist`).

`beforeAll` runs **`assertIntegrationDatabaseReady()`**, which checks that `public.users` exists using `TEST_DATABASE_URL` / `DATABASE_URL` in the **test process**. If that check passes but HTTP calls still return `Failed query`, the **auth server** is almost certainly using a **different** `DATABASE_URL` than your integration test env—align them and restart auth.

Confirm migrations are applied to the database the auth service actually uses.

## Commands

```bash
TEST_TENANT_ID=11111111-1111-4111-8111-111111111111 pnpm --filter @saas/auth test:integration
TEST_TENANT_ID=11111111-1111-4111-8111-111111111111 pnpm --filter @saas/auth test:contract
```
