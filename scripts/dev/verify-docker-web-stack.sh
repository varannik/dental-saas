#!/bin/bash
# Verify: API stack in Docker, web on host, web targets Docker gateway :4000.
# Usage: bash scripts/dev/verify-docker-web-stack.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

print_header "Docker API + local web verification"

fail=0

check_http_status() {
  local url="$1"
  local name="$2"
  local expected="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expected" ]; then
    log_success "$name → HTTP $code"
  else
    log_error "$name → HTTP $code (expected $expected)"
    fail=1
  fi
}

expect_docker_container() {
  local name="$1"
  if container_running "$name"; then
    log_success "Docker: $name is running"
    return 0
  fi
  log_error "Docker: $name is not running"
  fail=1
  return 1
}

expect_port_listener() {
  local port="$1"
  local label="$2"
  local expect_docker="${3:-any}"
  if ! lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    log_error "$label — port $port not listening"
    fail=1
    return 1
  fi
  local proc
  proc=$(lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR==2 {print $1}')
  if [ "$expect_docker" = "docker" ] && [ "$proc" != "com.docke" ]; then
    log_warning "$label — port $port listener is $proc (expected Docker/com.docke)"
  elif [ "$expect_docker" = "node" ] && [ "$proc" != "node" ]; then
    log_warning "$label — port $port listener is $proc (expected node for local Next.js)"
  else
    log_success "$label — port $port listening ($proc)"
  fi
}

log_step "1. Docker API containers (profile apps)"
for c in dental-saas-api-gateway dental-saas-auth dental-saas-users dental-saas-clinical; do
  expect_docker_container "$c" || true
done

log_step "2. Docker infrastructure"
for c in dental-saas-postgres dental-saas-redis; do
  expect_docker_container "$c" || true
done

log_step "3. Ports (4000–4003 should be Docker when using docker-up-apps)"
for p in 4000 4001 4002 4003; do
  expect_port_listener "$p" "API :$p" "docker" || true
done
expect_port_listener 3000 "Web (Next.js)" "node" || true

log_step "4. HTTP health (via published Docker ports)"
body=$(curl -s --connect-timeout 3 http://localhost:4000/health 2>/dev/null || echo "")
if echo "$body" | grep -q '"service":"api-gateway"'; then
  log_success "Gateway /health → api-gateway"
else
  log_error "Gateway /health unexpected: ${body:-<no response>}"
  fail=1
fi

check_http_status "http://localhost:4002/health" "Users" "200"
check_http_status "http://localhost:4003/health" "Clinical" "200"

auth_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://localhost:4001/auth/me 2>/dev/null || echo "000")
if [ "$auth_code" = "200" ] || [ "$auth_code" = "401" ]; then
  log_success "Auth /auth/me → HTTP $auth_code"
else
  log_error "Auth /auth/me → HTTP $auth_code"
  fail=1
fi

log_step "5. CORS (browser web → Docker gateway)"
cors_preflight=$(curl -s -D - -o /dev/null -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:4000/api/v1/auth/register 2>/dev/null | grep -i "access-control-allow-origin" || true)
if echo "$cors_preflight" | grep -qi "http://localhost:3000"; then
  log_success "CORS preflight allows http://localhost:3000"
else
  log_error "CORS preflight missing Allow-Origin for localhost:3000"
  fail=1
fi

# POST responses from proxied routes must include ACAO (browser blocks 201 without it).
cors_post=$(curl -s -D - -o /dev/null -X POST \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"email":"cors-check@test.local","password":"Password123!","fullName":"Cors Check","tenantId":"11111111-1111-4111-8111-111111111111"}' \
  http://localhost:4000/api/v1/auth/register 2>/dev/null | grep -i "access-control-allow-origin" || true)
if echo "$cors_post" | grep -qi "http://localhost:3000"; then
  log_success "CORS on POST /auth/register includes Allow-Origin"
else
  log_error "CORS on POST /auth/register missing Allow-Origin (rebuild: docker compose -f infrastructure/docker/docker-compose.yml --profile apps build api-gateway)"
  fail=1
fi

log_step "6. Web app API target (apps/web)"
WEB_ENV_FILE="$PROJECT_ROOT/apps/web/.env.local"
if [ -f "$WEB_ENV_FILE" ]; then
  gw=$(grep -E '^NEXT_PUBLIC_API_GATEWAY_URL=' "$WEB_ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
  log_info "apps/web/.env.local → NEXT_PUBLIC_API_GATEWAY_URL=${gw:-<empty>}"
else
  log_info "No apps/web/.env.local — api-client.ts falls back to http://localhost:4000"
  gw="http://localhost:4000"
fi
gw="${gw:-http://localhost:4000}"
if [ "$gw" = "http://localhost:4000" ] || [ "$gw" = "http://127.0.0.1:4000" ]; then
  log_success "Web will call Docker-published gateway at $gw"
else
  log_warning "Web gateway URL is $gw (not default :4000 — confirm that matches Docker publish)"
fi

web_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$web_code" != "000" ]; then
  log_success "Web app responding on http://localhost:3000 → HTTP $web_code"
else
  log_warning "Web app not reachable on :3000 — run: cd apps/web && pnpm dev"
fi

echo ""
if [ "$fail" -ne 0 ]; then
  log_error "Verification failed. Typical fix:"
  echo "  make docker-up && make docker-up-apps"
  echo "  cd apps/web && pnpm dev"
  exit 1
fi
log_success "Stack looks correct: Docker APIs on :4000–:4003, web uses gateway on :4000."
