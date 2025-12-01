# Integration Tests

API and service integration tests.

## Structure

```
integration/
├── api/
│   ├── auth.test.ts
│   ├── users.test.ts
│   └── billing.test.ts
├── services/
│   └── stripe.test.ts
├── helpers/
│   ├── api-client.ts
│   └── database.ts
└── setup.ts
```

## Running Tests

```bash
# Run all integration tests
pnpm test:integration

# Run with database setup
docker-compose -f docker-compose.test.yml up -d
pnpm test:integration

# Run specific test file
pnpm test:integration api/auth.test.ts
```

