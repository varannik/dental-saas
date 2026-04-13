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

log_step "Running migration pipeline via pnpm..."
cd "$PROJECT_ROOT"
NODE_ENV="$ENVIRONMENT" pnpm run db:migrate

print_separator
log_success "Database migrations completed for $ENVIRONMENT"
print_separator
echo ""
