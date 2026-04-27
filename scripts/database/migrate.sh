#!/bin/bash
# scripts/database/migrate.sh
# Run database migrations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

ENVIRONMENT=${1:-local}

print_header "Database Migrations: $ENVIRONMENT"

if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
  log_error "Invalid environment: $ENVIRONMENT"
  log_info "Valid options: local, staging, production"
  exit 1
fi

if [ ! -f "$PROJECT_ROOT/package.json" ]; then
  die "package.json not found in project root"
fi

if ! command_exists pnpm; then
  die "pnpm is required to run migrations"
fi

case "$ENVIRONMENT" in
  local)
    check_docker || die "Docker is required for local migrations"
    check_docker_running || die "Docker daemon is not running"

    log_step "Validating local PostgreSQL container..."
    if ! container_running "dental-saas-postgres"; then
      log_error "PostgreSQL container is not running"
      log_info "Start it with: make docker-up"
      exit 1
    fi

    wait_for_postgres "dental-saas-postgres"

    # Local default keeps make/db flow deterministic for developers.
    if [ -z "${DATABASE_URL:-}" ]; then
      export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dental_saas"
      log_info "DATABASE_URL not set. Using local default: $DATABASE_URL"
    fi

    log_step "Ensuring required PostgreSQL extensions (pgcrypto, vector)..."
    docker exec dental-saas-postgres psql \
      -U postgres \
      -d dental_saas \
      -v ON_ERROR_STOP=1 \
      -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
    ;;

  staging|production)
    log_step "Preparing migration for $ENVIRONMENT..."
    if [ -z "${DATABASE_URL:-}" ]; then
      log_error "DATABASE_URL is not set for $ENVIRONMENT migrations"
      log_info "Set DATABASE_URL and re-run this command"
      exit 1
    fi
    ;;
esac

log_step "Running Drizzle migrations..."
cd "$PROJECT_ROOT"
NODE_ENV="$ENVIRONMENT" pnpm exec drizzle-kit migrate --config=drizzle.config.ts

if [ "$ENVIRONMENT" = "local" ]; then
  verify_local_schema() {
    docker exec dental-saas-postgres psql \
      -U postgres \
      -d dental_saas \
      -t -A \
      -c "select to_regclass('public.users');" | xargs
  }

  log_step "Verifying migration state..."
  migrations_table=$(docker exec dental-saas-postgres psql \
    -U postgres \
    -d dental_saas \
    -t -A \
    -c "select to_regclass('drizzle.__drizzle_migrations');" | xargs)

  if [ "$migrations_table" != "drizzle.__drizzle_migrations" ]; then
    log_warning "drizzle.__drizzle_migrations table not found; falling back to schema verification checks"
  fi

  migrations_count=""
  if [ "$migrations_table" = "drizzle.__drizzle_migrations" ]; then
    migrations_count=$(docker exec dental-saas-postgres psql \
      -U postgres \
      -d dental_saas \
      -t -A \
      -c "select count(*) from drizzle.__drizzle_migrations;" | xargs)
  fi

  public_table_count=$(docker exec dental-saas-postgres psql \
    -U postgres \
    -d dental_saas \
    -t -A \
    -c "select count(*) from information_schema.tables where table_schema='public';" | xargs)

  users_table=$(verify_local_schema)

  if [ "$users_table" != "users" ]; then
    log_warning "Schema is still missing required tables after drizzle migrate; applying SQL fallback from ./drizzle/*.sql"

    shopt -s nullglob
    migration_files=("$PROJECT_ROOT"/drizzle/*.sql)
    if [ "${#migration_files[@]}" -eq 0 ]; then
      log_error "Fallback failed: no migration SQL files found in ./drizzle"
      exit 1
    fi

    for migration_file in "${migration_files[@]}"; do
      log_info "Applying fallback migration: $(basename "$migration_file")"
      docker exec -i dental-saas-postgres psql \
        -U postgres \
        -d dental_saas \
        -v ON_ERROR_STOP=1 < "$migration_file" >/dev/null
    done

    users_table=$(verify_local_schema)
    public_table_count=$(docker exec dental-saas-postgres psql \
      -U postgres \
      -d dental_saas \
      -t -A \
      -c "select count(*) from information_schema.tables where table_schema='public';" | xargs)
  fi

  if [ "$users_table" != "users" ]; then
    log_error "Migration verification failed: required table 'users' is missing"
    exit 1
  fi

  if [ "${public_table_count:-0}" -lt 1 ]; then
    log_error "Migration verification failed: no public tables found"
    exit 1
  fi

  if [ -n "$migrations_count" ]; then
    log_success "Migration verification passed (ledger rows: $migrations_count, users table present, public tables: $public_table_count)"
  else
    log_success "Migration verification passed (users table present, public tables: $public_table_count)"
  fi
fi

print_separator
log_success "Database migrations completed for $ENVIRONMENT"
print_separator
echo ""
