# Step-by-Step: Phase 1 — Core Foundation

**Goal:** Database running with real tables, shared packages created, auth service working, API gateway routing requests.

**Time Estimate:** 3 weeks

---

## Week 2: Database + Shared Packages

### Step 1: Install Drizzle ORM and Generate Schema

```bash
# Add Drizzle to root workspace
pnpm add -D -w drizzle-kit

# Create the shared database package
cd packages/config
pnpm init
```

Create `packages/config/package.json`:

```json
{
  "name": "@dental/config",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "dotenv": "^16.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

Create `packages/config/src/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
  OPENAI_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().default('dental-saas-local'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}
```

Create `packages/config/src/database.ts`:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export function createDatabaseConnection(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return drizzle(pool);
}
```

Create `packages/config/src/index.ts`:

```typescript
export { loadEnv, type Env } from './env';
export { createDatabaseConnection } from './database';
```

### Step 2: Generate TypeScript Types from Schema YAML

Create `packages/types/package.json`:

```json
{
  "name": "@dental/types",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

Create `packages/types/src/tenancy.ts` (derived from `schema-core.yaml`):

```typescript
export type TenantType =
  | 'SOLO_PRACTICE'
  | 'GROUP_PRACTICE'
  | 'DSO'
  | 'ACADEMIC'
  | 'PAYER'
  | 'REGULATOR'
  | 'AI_VENDOR'
  | 'OTHER';

export type UserType =
  | 'DENTIST'
  | 'HYGIENIST'
  | 'ASSISTANT'
  | 'ADMIN'
  | 'FRONT_DESK'
  | 'PATIENT'
  | 'PAYER_ANALYST'
  | 'REGULATOR'
  | 'DEVELOPER';

export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  parentTenantId: string | null;
  primaryRegion: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  preferredLocale: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserTenant {
  userId: string;
  tenantId: string;
  defaultLocationId: string | null;
  userType: UserType;
  createdAt: Date;
  updatedAt: Date;
}
```

Create similar type files for:

- `packages/types/src/clinical.ts` — Patient, Encounter, ClinicalNote
- `packages/types/src/imaging.ts` — ImagingStudy, ImagingObject, AIPrediction
- `packages/types/src/voice.ts` — VoiceSession, VoiceUtterance
- `packages/types/src/agent.ts` — AgentWorkflow, AgentExecution, AgentStep
- `packages/types/src/billing.ts` — TreatmentPlan, Claim, ClaimLine

### Step 3: Create Drizzle Schema Definitions

Create `packages/config/src/schema/` directory with Drizzle table definitions matching your YAML:

```typescript
// packages/config/src/schema/tenants.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  parentTenantId: uuid('parent_tenant_id').references(() => tenants.id),
  primaryRegion: text('primary_region'),
  partitionStrategy: text('partition_strategy').notNull().default('ROW_LEVEL'),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Repeat for all entities in `schema-core.yaml` and `schema-agent-extensions.yaml`.

### Step 4: Generate and Run Migrations

```bash
# Generate migration SQL from Drizzle schema
npx drizzle-kit generate

# Review the generated SQL
ls -la drizzle/

# Apply migrations
npx drizzle-kit migrate

# Verify tables exist
docker exec dental-saas-postgres psql -U postgres -d dental_saas -c "\dt"
```

### Step 5: Create Seed Data

Create `packages/config/src/seed.ts`:

```typescript
import { createDatabaseConnection } from './database';
import { tenants, users, userTenants, roles, permissions } from './schema';

async function seed() {
  const db = createDatabaseConnection(process.env.DATABASE_URL!);

  // Create default tenant
  await db.insert(tenants).values({
    name: 'Demo Dental Practice',
    type: 'SOLO_PRACTICE',
    primaryRegion: 'eu-central-1',
  });

  // Create admin user
  // Create default roles (Admin, Dentist, Hygienist, Front Desk)
  // Create default permissions
  // Create sample patients

  console.log('Seed data inserted successfully');
}

seed().catch(console.error);
```

### Step 6: Create Shared Utils Package

Create `packages/utils/package.json` and implement:

```typescript
// packages/utils/src/validation.ts
export function isValidToothNumber(tooth: string): boolean {
  const num = parseInt(tooth, 10);
  return num >= 1 && num <= 32;
}

export function isValidCDTCode(code: string): boolean {
  return /^D\d{4}$/.test(code);
}

// packages/utils/src/id.ts
import { randomUUID } from 'crypto';
export const generateId = () => randomUUID();

// packages/utils/src/date.ts
export function formatEncounterDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
```

---

## Week 3: Auth Service

### Step 1: Initialize Auth Service

```bash
cd services/auth
pnpm init
```

Create `services/auth/package.json`:

```json
{
  "name": "@dental/auth",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:unit": "vitest run"
  },
  "dependencies": {
    "@dental/config": "workspace:*",
    "@dental/types": "workspace:*",
    "@dental/utils": "workspace:*",
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/cookie": "^10.0.0",
    "drizzle-orm": "^0.36.0",
    "pg": "^8.13.0",
    "ioredis": "^5.4.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/pg": "^8.11.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

### Step 2: Implement Auth Service Core

```
services/auth/src/
├── index.ts              # Fastify server entry point
├── routes/
│   ├── register.ts       # POST /auth/register
│   ├── login.ts          # POST /auth/login
│   ├── logout.ts         # POST /auth/logout
│   ├── refresh.ts        # POST /auth/refresh
│   ├── me.ts             # GET /auth/me
│   └── sessions.ts       # GET /auth/sessions (active sessions)
├── middleware/
│   ├── authenticate.ts   # JWT validation middleware
│   ├── authorize.ts      # RBAC permission checking
│   └── tenant-context.ts # Extract tenant from JWT, set context
├── services/
│   ├── auth.service.ts   # Business logic: register, login, verify
│   ├── token.service.ts  # JWT issuance, refresh rotation
│   └── session.service.ts# Redis session management
├── schemas/
│   ├── register.schema.ts# Zod validation for registration
│   ├── login.schema.ts   # Zod validation for login
│   └── common.schema.ts  # Shared validation schemas
└── __tests__/
    ├── auth.service.test.ts
    ├── token.service.test.ts
    └── routes/
        ├── register.test.ts
        └── login.test.ts
```

Key implementation details:

**Token Service** (from your Redis patterns doc):

```typescript
// Redis key pattern: dental:session:{tenant_id}:{session_id}
// TTL: 86400 (24 hours)
// Stores: userId, tenantId, roles, permissions, lastActivity
```

**Auth Flow:**

```
Register → Hash password → Insert user → Insert user_tenant → Issue JWT
Login → Verify password → Create Redis session → Issue JWT + Refresh token
Refresh → Validate refresh token → Rotate token → Issue new JWT
Logout → Delete Redis session → Blacklist JWT
```

### Step 3: Create Dockerfile for Auth Service

```dockerfile
# services/auth/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY services/auth/package.json services/auth/
RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY services/auth/ services/auth/
COPY tsconfig.json .
RUN pnpm --filter @dental/auth build

FROM base AS runtime
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/services/auth/dist services/auth/dist
COPY --from=build /app/packages packages

EXPOSE 4001
CMD ["node", "services/auth/dist/index.js"]
```

### Step 4: Test Auth Service

```bash
# Run tests
cd services/auth
pnpm test

# Start in development
pnpm dev

# Test endpoints
curl -X POST http://localhost:4001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dentist@example.com","password":"SecurePass123","fullName":"Dr. Smith","tenantId":"..."}'

curl -X POST http://localhost:4001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dentist@example.com","password":"SecurePass123"}'
```

---

## Week 4: API Gateway + User Service

### Step 1: Create API Gateway

```
apps/api-gateway/src/
├── index.ts              # Fastify server entry
├── plugins/
│   ├── auth.ts           # JWT validation plugin
│   ├── rate-limit.ts     # Redis-based rate limiting
│   ├── cors.ts           # CORS configuration
│   └── websocket.ts      # WebSocket upgrade handler
├── routes/
│   ├── auth.proxy.ts     # Proxy to auth service
│   ├── users.proxy.ts    # Proxy to users service
│   ├── patients.proxy.ts # Proxy to clinical routes (future)
│   └── voice.proxy.ts    # WebSocket proxy for voice (future)
├── middleware/
│   ├── request-id.ts     # Add X-Request-Id header
│   ├── logging.ts        # Request/response logging
│   └── tenant-resolver.ts# Resolve tenant from JWT or subdomain
└── __tests__/
```

Key configuration:

```typescript
// Rate limiting from Redis patterns doc
// Key: dental:ratelimit:{tenant_id}:{user_id}:{endpoint}
// Window: 60 seconds
// Limits: Public 100/min, Authenticated 1000/min, Admin 5000/min
```

### Step 2: Create User Service

```
services/users/src/
├── index.ts
├── routes/
│   ├── users.ts          # User CRUD
│   ├── tenants.ts        # Tenant management
│   ├── locations.ts      # Location CRUD
│   └── roles.ts          # Role/permission management
├── services/
│   ├── user.service.ts
│   ├── tenant.service.ts
│   └── location.service.ts
├── schemas/
│   ├── user.schema.ts
│   ├── tenant.schema.ts
│   └── location.schema.ts
└── __tests__/
```

### Step 3: Integration Test the Full Stack

```bash
# Start infrastructure
make docker-up

# Run migrations
make db-migrate

# Start services (in separate terminals)
cd services/auth && pnpm dev      # Port 4001
cd services/users && pnpm dev     # Port 4002
cd apps/api-gateway && pnpm dev   # Port 4000

# Test full flow through gateway
# Register
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dental.com","password":"Secure123!","fullName":"Admin User"}'

# Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dental.com","password":"Secure123!"}' | jq -r '.accessToken')

# Get profile (authenticated)
curl http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Create tenant
curl -X POST http://localhost:4000/api/v1/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smile Dental","type":"SOLO_PRACTICE"}'
```

---

## Verification Checklist

At the end of Phase 1, verify:

- [ ] All 25+ core schema tables exist in PostgreSQL
- [ ] `packages/types` exports TypeScript interfaces for all entities
- [ ] `packages/config` provides database connection and env loading
- [ ] `packages/utils` provides validation utilities
- [ ] Auth service: register, login, logout, refresh, me endpoints work
- [ ] Auth service: Redis sessions created/destroyed on login/logout
- [ ] Auth service: JWT includes userId, tenantId, roles
- [ ] API Gateway: Proxies requests to auth and user services
- [ ] API Gateway: Rate limiting works (Redis-backed)
- [ ] API Gateway: Invalid JWTs are rejected
- [ ] User service: CRUD operations work through gateway
- [ ] All services start with `pnpm dev` and have hot-reload
- [ ] Unit tests pass for auth and user services
- [ ] `make docker-up` → `make db-migrate` → services start — full flow works

---

## What This Enables

After Phase 1:

- Multi-tenant authentication system working
- Real database with all tables
- API accessible through gateway
- Foundation for all subsequent features
- Ready for clinical data operations (Phase 2)
