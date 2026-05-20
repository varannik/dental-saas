#!/bin/bash
# Start all API services in Docker (auth, users, clinical, api-gateway) — Compose profile `apps`.
# Requires ports 4000–4003 free on the host (stop any local Node listeners first).
# Web app still runs on the host: cd apps/web && pnpm dev

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

print_header "Start Docker API stack (auth, users, clinical, gateway)"

check_docker || die "Docker is required"
check_docker_running || die "Docker daemon is not running"
check_docker_compose || die "Docker Compose is required"

if ! container_running "dental-saas-postgres"; then
  log_error "PostgreSQL is not running"
  log_info "Run: make docker-up"
  exit 1
fi

for port in 4000 4001 4002 4003; do
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    proc=$(lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR==2 {print $1, $2}')
    log_error "Port $port is already in use ($proc)."
    log_info "Stop the process above, then rerun: make docker-up-apps"
    exit 1
  fi
done

log_step "Building and starting Compose profile: apps (rebuild gateway after CORS changes)..."
start_containers "apps"

wait_for_postgres "dental-saas-postgres"
wait_for_redis "dental-saas-redis"

sessions_table=$(docker exec dental-saas-postgres psql -U postgres -d dental_saas -t -A \
  -c "select to_regclass('public.sessions');" 2>/dev/null | xargs || true)
if [ "$sessions_table" != "sessions" ]; then
  log_warning "Table public.sessions is missing — login will fail after password check."
  log_info "Run: make db-migrate"
fi

wait_for_http() {
  local url="$1"
  local name="$2"
  local expected_statuses="${3:-200}"
  local max_attempts=60
  local attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    IFS=',' read -r -a expected_array <<<"$expected_statuses"
    for expected in "${expected_array[@]}"; do
      if [ "$status" = "$expected" ]; then
        log_success "$name is healthy ($url → $status)"
        return 0
      fi
    done
    sleep 2
    attempt=$((attempt + 1))
  done
  log_error "$name failed health check at $url (last status: $status, expected: $expected_statuses)"
  return 1
}

log_step "Waiting for API containers..."
wait_for_http "http://localhost:4001/auth/me" "Auth" "200,401"
wait_for_http "http://localhost:4002/health" "Users" "200"
wait_for_http "http://localhost:4003/health" "Clinical" "200"
wait_for_http "http://localhost:4000/health" "API gateway" "200"

print_separator
log_success "Docker API stack is ready."
echo ""
log_info "Endpoints (from your browser / host):"
echo "  • API gateway:  http://localhost:4000"
echo "  • Auth:         http://localhost:4001"
echo "  • Users:        http://localhost:4002"
echo "  • Clinical:     http://localhost:4003"
echo ""
log_info "Web app (host):"
echo "  • cd apps/web && pnpm dev"
echo "  • apps/web/.env.local → NEXT_PUBLIC_API_GATEWAY_URL=http://localhost:4000"
echo ""
log_info "Logs: docker logs -f dental-saas-api-gateway"
print_separator
