#!/bin/bash
# scripts/database/seed.sh
# Seed database with test data

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

ENVIRONMENT=${1:-local}

print_header "Database Seed: $ENVIRONMENT"

if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
  log_error "Invalid environment: $ENVIRONMENT"
  log_info "Valid options: local, staging, production"
  exit 1
fi

if [ ! -f "$PROJECT_ROOT/package.json" ]; then
  die "package.json not found in project root"
fi

if ! command_exists pnpm; then
  die "pnpm is required to run seeding"
fi

case "$ENVIRONMENT" in
  local)
    check_docker || die "Docker is required for local seeding"
    check_docker_running || die "Docker daemon is not running"

    log_step "Validating local PostgreSQL container..."
    if ! container_running "dental-saas-postgres"; then
      log_error "PostgreSQL container is not running"
      log_info "Start it with: make docker-up"
      exit 1
    fi

    wait_for_postgres "dental-saas-postgres"

    if [ -z "${DATABASE_URL:-}" ]; then
      export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dental_saas"
      log_info "DATABASE_URL not set. Using local default: $DATABASE_URL"
    fi
    ;;

  staging|production)
    log_step "Preparing seed for $ENVIRONMENT..."
    if [ -z "${DATABASE_URL:-}" ]; then
      log_error "DATABASE_URL is not set for $ENVIRONMENT seeding"
      log_info "Set DATABASE_URL and re-run this command"
      exit 1
    fi
    ;;
esac

log_step "Building @saas/config seed executable..."
cd "$PROJECT_ROOT"
pnpm --filter @saas/config build

log_step "Running shared seed script..."
node packages/config/dist/seed.js

log_step "Ensuring deterministic demo tenant id for integration tests..."
if [ "$ENVIRONMENT" = "local" ]; then
  docker exec -i dental-saas-postgres psql \
    -U postgres \
    -d dental_saas \
    -v ON_ERROR_STOP=1 <<'SQL'
insert into tenants (
  id,
  name,
  type,
  primary_region,
  default_locale,
  supported_locales,
  supported_languages,
  partition_strategy,
  status
)
values (
  '11111111-1111-4111-8111-111111111111',
  'Demo Dental Practice',
  'SOLO_PRACTICE',
  'eu-central-1',
  'en-US',
  '["en-US"]'::jsonb,
  '["en"]'::jsonb,
  'ROW_LEVEL',
  'ACTIVE'
)
on conflict (id) do update
set
  name = excluded.name,
  type = excluded.type,
  primary_region = excluded.primary_region,
  default_locale = excluded.default_locale,
  supported_locales = excluded.supported_locales,
  supported_languages = excluded.supported_languages,
  partition_strategy = excluded.partition_strategy,
  status = excluded.status,
  updated_at = now();
SQL
else
  pnpm --filter @saas/config exec node -e "import('pg').then(async ({Client}) => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(\`
      insert into tenants (id, name, type, primary_region, default_locale, supported_locales, supported_languages, partition_strategy, status)
      values (\$1, \$2, \$3, \$4, \$5, \$6::jsonb, \$7::jsonb, \$8, \$9)
      on conflict (id) do update set
        name = excluded.name,
        type = excluded.type,
        primary_region = excluded.primary_region,
        default_locale = excluded.default_locale,
        supported_locales = excluded.supported_locales,
        supported_languages = excluded.supported_languages,
        partition_strategy = excluded.partition_strategy,
        status = excluded.status,
        updated_at = now()
    \`, [
      '11111111-1111-4111-8111-111111111111',
      'Demo Dental Practice',
      'SOLO_PRACTICE',
      'eu-central-1',
      'en-US',
      JSON.stringify(['en-US']),
      JSON.stringify(['en']),
      'ROW_LEVEL',
      'ACTIVE'
    ]);
    await client.end();
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });"
fi

if [ "$ENVIRONMENT" = "local" ]; then
  log_step "Cleaning transient integration-only test data (itest users / gateway tenants)..."
  docker exec -i dental-saas-postgres psql \
    -U postgres \
    -d dental_saas \
    -v ON_ERROR_STOP=1 <<'SQL'
begin;

with user_ids as (
  select id
  from users
  where email like 'itest.%@%'
)
delete from sessions
where user_id in (select id from user_ids);

with user_ids as (
  select id
  from users
  where email like 'itest.%@%'
)
delete from user_auth_identities
where user_id in (select id from user_ids);

with user_ids as (
  select id
  from users
  where email like 'itest.%@%'
)
delete from user_tenants
where user_id in (select id from user_ids);

delete from users
where email like 'itest.%@%';

delete from tenants
where name like 'Gateway Tenant %';

commit;
SQL
fi

print_separator
log_success "Database seeding completed for $ENVIRONMENT"
print_separator
echo ""
