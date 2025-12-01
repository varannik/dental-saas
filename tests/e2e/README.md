# End-to-End Tests

E2E tests using Playwright.

## Structure

```
e2e/
├── tests/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   └── register.spec.ts
│   ├── dashboard/
│   │   └── dashboard.spec.ts
│   └── settings/
│       └── settings.spec.ts
├── fixtures/
│   └── users.ts
├── pages/
│   ├── login.page.ts
│   └── dashboard.page.ts
├── playwright.config.ts
└── package.json
```

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run in headed mode
pnpm test:e2e --headed

# Run specific test file
pnpm test:e2e tests/auth/login.spec.ts

# Generate report
pnpm test:e2e --reporter=html
```

