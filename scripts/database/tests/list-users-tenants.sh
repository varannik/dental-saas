#!/bin/bash
# List users, tenants, and user ↔ tenant membership (local Docker Postgres).
# Lives under scripts/database/tests/ — lib helpers are two levels up.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../lib/common.sh"
source "$SCRIPT_DIR/../../lib/docker.sh"

CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-dental-saas-postgres}"
DB_NAME="${POSTGRES_DB:-dental_saas}"
DB_USER="${POSTGRES_USER:-postgres}"

print_header "Users & tenants ($CONTAINER_NAME / $DB_NAME)"

check_docker || die "Docker is required"
check_docker_running || die "Docker daemon is not running"

if ! container_running "$CONTAINER_NAME"; then
  log_error "Container $CONTAINER_NAME is not running"
  log_info "Start with: make docker-up"
  exit 1
fi

wait_for_postgres "$CONTAINER_NAME"

run_sql() {
  docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

log_step "Tenants"
run_sql -c "SELECT id, name, type, status, created_at FROM tenants ORDER BY name;"

log_step "Users"
run_sql -c "SELECT id, email, full_name, status, created_at FROM users ORDER BY email;"

log_step "Membership (user_tenants)"
run_sql -c "
SELECT
  u.email,
  u.full_name,
  t.name AS tenant_name,
  ut.tenant_id,
  ut.user_type,
  ut.created_at AS membership_created_at
FROM user_tenants ut
JOIN users u ON u.id = ut.user_id
JOIN tenants t ON t.id = ut.tenant_id
ORDER BY t.name, u.email;
"

log_success "Done"
