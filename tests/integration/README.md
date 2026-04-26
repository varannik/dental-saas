# Integration Tests

Cross-service integration tests only.

## Structure

```
integration/
├── api/            # tests that require multiple services together
├── services/       # external-provider integration tests spanning services
└── README.md
```

## Ownership Rules

- Service-specific integration/contract tests live with the service code.
  - Example: auth integration tests live in `services/auth/src/__tests__/integration`.
- Top-level `tests/integration` is reserved for cross-service scenarios.

## Running Tests

```bash
# Service-specific integration tests (example: auth)
TEST_TENANT_ID=11111111-1111-4111-8111-111111111111 pnpm --filter @saas/auth test:integration

# Service-specific contract tests (example: auth)
TEST_TENANT_ID=11111111-1111-4111-8111-111111111111 pnpm --filter @saas/auth test:contract

# Cross-service integration tests (top-level)
pnpm test:integration
```
