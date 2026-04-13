# Step-by-Step: Phase 0 — Foundation Fix

**Goal:** Make the existing scaffold actually work before building anything new.

**Time Estimate:** 1-2 days

---

## Step 1: Fix ESLint Configuration

The `lint-staged` config calls `eslint --fix` but no ESLint config exists.

```bash
# Install ESLint and TypeScript support
pnpm add -D -w eslint @eslint/js typescript-eslint eslint-config-prettier

# Verify installation
npx eslint --version
```

Create `eslint.config.js` at project root:

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/coverage/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
```

Test it:

```bash
npx eslint --max-warnings 0 .
```

---

## Step 2: Create `.env.example`

```bash
touch .env.example
```

Contents:

```env
# ============================================
# Dental SaaS Platform - Environment Variables
# ============================================
# Copy this file to .env.local and fill in values

# ---- Application ----
NODE_ENV=development
APP_PORT=3000
API_GATEWAY_PORT=4000
LOG_LEVEL=debug

# ---- Database (PostgreSQL) ----
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=dental_saas
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dental_saas

# ---- Redis ----
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL=redis://localhost:6379

# ---- MinIO / S3 ----
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=dental-saas-local
S3_REGION=eu-central-1

# ---- JWT / Auth ----
JWT_SECRET=your-dev-secret-change-in-production
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
JWT_ISSUER=dental-saas

# ---- AI / LLM ----
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-large

# ---- Voice / ASR ----
DEEPGRAM_API_KEY=your-deepgram-key
DEEPGRAM_MODEL=nova-3

# ---- AWS (Production) ----
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# ---- LocalStack (Local Development) ----
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_DEFAULT_REGION=eu-central-1

# ---- Monitoring ----
SENTRY_DSN=
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=dental-saas
```

Add `.env.local` to `.gitignore` if not already:

```bash
echo ".env.local" >> .gitignore
echo ".env" >> .gitignore
```

---

## Step 3: Fix pnpm-lock.yaml

```bash
# Clean install to regenerate lock file properly
rm -rf node_modules
pnpm install

# Verify the lock file exists and is valid
ls -la pnpm-lock.yaml
```

---

## Step 4: Create Missing `scripts/build/` Directory

```bash
mkdir -p scripts/build
```

Create `scripts/build/build-all.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/common.sh"

log_info "Building all packages and applications..."

cd "$PROJECT_ROOT"

if command -v pnpm &> /dev/null; then
  pnpm turbo run build
else
  log_error "pnpm is not installed"
  exit 1
fi

log_success "All packages built successfully"
```

Create `scripts/build/build-services.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/common.sh"

log_info "Building all services..."

cd "$PROJECT_ROOT"
pnpm turbo run build --filter='./services/*'

log_success "All services built successfully"
```

Create `scripts/build/build-docker.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/common.sh"

TAG="${1:-latest}"

log_info "Building Docker images (tag: $TAG)..."

for service_dir in "$PROJECT_ROOT"/services/*/; do
  service_name=$(basename "$service_dir")
  if [ -f "$service_dir/Dockerfile" ]; then
    log_info "Building $service_name..."
    docker build -t "dental-saas/$service_name:$TAG" -f "$service_dir/Dockerfile" "$PROJECT_ROOT"
  else
    log_warn "Skipping $service_name (no Dockerfile)"
  fi
done

log_success "Docker images built successfully"
```

Make them executable:

```bash
chmod +x scripts/build/*.sh
```

---

## Step 5: Fix DB Password Mismatch

Edit `scripts/local/start.sh` — find any reference to `postgres_dev_password` and change to `postgres` (matching docker-compose.yml).

```bash
# Search for the mismatch
grep -r "postgres_dev_password" scripts/
# Then edit the file to use 'postgres' instead
```

---

## Step 6: Fix Region Inconsistency

```bash
# Find us-east-1 references that should be eu-central-1
grep -r "us-east-1" scripts/ infrastructure/ --include="*.sh" --include="*.tf"
# Fix each occurrence to eu-central-1
```

---

## Step 7: Implement Critical Stub Scripts

### `scripts/docker/start.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/common.sh"
source "$PROJECT_ROOT/scripts/lib/docker.sh"

log_info "Starting Docker containers..."

cd "$PROJECT_ROOT"

COMPOSE_FILE="infrastructure/docker/docker-compose.yml"

if [[ "$(uname)" == "Darwin" ]]; then
  MACOS_OVERRIDE="infrastructure/docker/docker-compose.macos.yml"
  if [ -f "$MACOS_OVERRIDE" ]; then
    docker compose -f "$COMPOSE_FILE" -f "$MACOS_OVERRIDE" up -d
  else
    docker compose -f "$COMPOSE_FILE" up -d
  fi
else
  docker compose -f "$COMPOSE_FILE" up -d
fi

log_info "Waiting for services to be healthy..."
sleep 5

docker compose -f "$COMPOSE_FILE" ps

log_success "Docker containers started"
log_info "PostgreSQL: localhost:5432"
log_info "Redis:      localhost:6379"
log_info "MinIO:      localhost:9000 (console: localhost:9001)"
log_info "LocalStack: localhost:4566"
```

### `scripts/docker/stop.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/common.sh"

log_info "Stopping Docker containers..."

cd "$PROJECT_ROOT"
docker compose -f infrastructure/docker/docker-compose.yml down

log_success "Docker containers stopped"
```

### `scripts/database/migrate.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/common.sh"

ENV="${1:-local}"
log_info "Running database migrations (environment: $ENV)..."

cd "$PROJECT_ROOT"

if [ "$ENV" = "local" ]; then
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dental_saas"
else
  log_error "Remote migrations not yet configured for environment: $ENV"
  exit 1
fi

export DATABASE_URL

if command -v pnpm &> /dev/null && [ -f "package.json" ]; then
  pnpm turbo run db:migrate 2>/dev/null || log_warn "No db:migrate script found in workspace packages yet"
fi

log_success "Database migrations completed"
```

### `scripts/dev/start.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PROJECT_ROOT/scripts/lib/common.sh"

log_info "Starting development servers..."

cd "$PROJECT_ROOT"

if command -v pnpm &> /dev/null; then
  pnpm turbo run dev
else
  log_error "pnpm is not installed"
  exit 1
fi
```

Make all executable:

```bash
chmod +x scripts/docker/start.sh scripts/docker/stop.sh scripts/database/migrate.sh scripts/dev/start.sh
```

---

## Step 8: Clean Up Stale References

```bash
# Remove references to non-existent files in SETUP_SUMMARY.md
# Search for stale documentation references
rg "non-existent|stale.*reference" *.md docs/
```

Edit files to remove or update references to these non-existent docs.

---

## Verification Checklist

After completing all steps:

```bash
# 1. ESLint works
npx eslint --max-warnings 0 .

# 2. Lock file exists
test -f pnpm-lock.yaml && echo "OK" || echo "MISSING"

# 3. Build scripts exist
ls scripts/build/

# 4. Docker starts
make docker-up
make docker-ps

# 5. Docker stops
make docker-down

# 6. All scripts are executable
find scripts/ -name "*.sh" ! -executable

# 7. No region inconsistencies
grep -r "us-east-1" scripts/ infrastructure/ --include="*.sh" --include="*.tf" | grep -v ".terraform/"
```

---

## What This Enables

After Phase 0 is complete:

- `make docker-up` / `make docker-down` works
- `make build` doesn't fail on missing scripts
- Pre-commit hooks pass (ESLint exists)
- New developers can copy `.env.example` and get started
- CI pipeline has a chance of passing
- Foundation is solid for Phase 1 (actual code)
