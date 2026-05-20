#!/bin/bash
# Verify local dev ports: Docker infra + host-run gateway + published service ports.
# Run from repo root: bash scripts/dev/check-services.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

print_header "Local service port check"

check_port() {
  local port="$1"
  local label="$2"
  if lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    local proc
    proc=$(lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR==2 {print $1, $2}')
    log_success "$label — port $port LISTEN ($proc)"
    return 0
  fi
  log_error "$label — port $port not listening"
  return 1
}

check_http() {
  local url="$1"
  local label="$2"
  local expect="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expect" ] || { [ "$expect" = "any" ] && [ "$code" != "000" ]; }; then
    log_success "$label — $url → HTTP $code"
    return 0
  fi
  log_error "$label — $url → HTTP $code (expected $expect)"
  return 1
}

check_cors() {
  local origin="${1:-http://localhost:3000}"
  local headers
  headers=$(curl -s -D - -o /dev/null -X OPTIONS \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: POST" \
    "http://localhost:4000/api/v1/auth/register" 2>/dev/null || true)
  if echo "$headers" | grep -qi "access-control-allow-origin: $origin"; then
    log_success "Gateway CORS preflight — Access-Control-Allow-Origin: $origin"
    return 0
  fi
  log_error "Gateway CORS preflight — missing Access-Control-Allow-Origin for Origin: $origin"
  echo "$headers" | grep -i access-control || echo "(no access-control-* headers)"
  return 1
}

identify_gateway() {
  local body
  body=$(curl -s --connect-timeout 3 "http://localhost:4000/health" 2>/dev/null || echo "")
  if echo "$body" | grep -q '"service":"api-gateway"'; then
    log_success "Port 4000 identifies as api-gateway (/health)"
    return 0
  fi
  if [ -n "$body" ]; then
    log_warning "Port 4000 /health responded but not api-gateway: $body"
  else
    log_warning "Port 4000 /health did not return api-gateway JSON (gateway may be down or wrong process)"
  fi
  return 1
}

echo ""
log_step "Expected layout (browser → host gateway → Docker or host upstreams)"
cat <<'EOF'
  Web (Next.js)     http://localhost:3000
  API gateway       http://localhost:4000   ← Docker (make docker-up-apps)
  Auth              http://localhost:4001   ← Docker OR host (not both)
  Users             http://localhost:4002
  Clinical          http://localhost:4003
  Postgres (Docker) localhost:5433
  Redis (Docker)    localhost:6379
EOF
echo ""

fail=0

log_step "Infrastructure (Docker)"
check_port 5433 "PostgreSQL" || fail=1
check_port 6379 "Redis" || fail=1

log_step "Application ports"
check_port 4000 "API gateway" || fail=1
check_port 4001 "Auth" || fail=1
check_port 4002 "Users" || fail=1
check_port 4003 "Clinical" || fail=1
check_port 3000 "Web (optional)" || true

log_step "HTTP health"
identify_gateway || fail=1
check_http "http://localhost:4000/health" "Gateway" "200" || fail=1
check_http "http://localhost:4001/auth/me" "Auth" "any" || fail=1
check_http "http://localhost:4002/health" "Users" "200" || fail=1
check_http "http://localhost:4003/health" "Clinical" "200" || fail=1

log_step "CORS (gateway must allow your web Origin)"
check_cors "http://localhost:3000" || fail=1
check_cors "http://127.0.0.1:3000" || true

log_step "Docker containers (if using Compose)"
if command -v docker >/dev/null 2>&1; then
  docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" 2>/dev/null | grep -E "dental-saas|NAMES" || log_info "No dental-saas containers running"
else
  log_info "docker not available"
fi

echo ""
if [ "$fail" -ne 0 ]; then
  log_error "Some checks failed."
  echo ""
  log_info "Typical fixes:"
  echo "  • Docker infra:       make docker-up"
  echo "  • Docker APIs:        make docker-up-apps"
  echo "  • Web (host):         cd apps/web && pnpm dev"
  echo "  • After API changes:  rebuild gateway — docker compose -f infrastructure/docker/docker-compose.yml --profile apps build api-gateway"
  exit 1
fi

log_success "All critical checks passed."
