#!/bin/bash
# Diagnose login 500/503: DB identity, sessions table, Redis from auth container, direct login curl.
# Usage:
#   bash scripts/dev/diagnose-auth-login.sh
#   bash scripts/dev/diagnose-auth-login.sh user@example.com 'YourPassword123!'

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

EMAIL="${1:-}"
PASSWORD="${2:-}"
TENANT_ID="${TEST_TENANT_ID:-11111111-1111-4111-8111-111111111111}"

print_header "Auth login diagnostics"

if ! container_running "dental-saas-postgres"; then
  die "PostgreSQL container is not running. Run: make docker-up"
fi

log_step "1. Schema: sessions table"
sessions_table=$(docker exec dental-saas-postgres psql -U postgres -d dental_saas -t -A \
  -c "select to_regclass('public.sessions');" 2>/dev/null | xargs || true)
if [ "$sessions_table" = "sessions" ]; then
  log_success "public.sessions exists"
else
  log_error "public.sessions is missing (login fails after password check)"
  log_info "Fix: make db-migrate"
fi

log_step "2. Auth container env (when running)"
if container_running "dental-saas-auth"; then
  auth_redis=$(docker exec dental-saas-auth printenv REDIS_URL 2>/dev/null || true)
  auth_db=$(docker exec dental-saas-auth printenv DATABASE_URL 2>/dev/null || true)
  auth_node=$(docker exec dental-saas-auth printenv NODE_ENV 2>/dev/null || true)
  log_info "REDIS_URL=${auth_redis:-<unset>}"
  log_info "DATABASE_URL=${auth_db:-<unset>}"
  log_info "NODE_ENV=${auth_node:-<unset>}"
  if [ "$auth_redis" != "redis://redis:6379" ]; then
    log_error "Auth REDIS_URL should be redis://redis:6379 inside Docker (got: ${auth_redis:-<unset>})"
    log_info "Fix: make docker-up-apps  (recreates auth with compose overrides)"
  else
    log_success "Auth REDIS_URL points at Compose Redis"
  fi
  if echo "$auth_db" | grep -q '@postgres:5432/'; then
    log_success "Auth DATABASE_URL targets Compose Postgres"
  else
    log_warning "Auth DATABASE_URL may not target Compose Postgres: ${auth_db:-<unset>}"
  fi

  log_step "3. Redis ping from auth container"
  if docker exec dental-saas-auth node -e "
const Redis = require('ioredis');
const url = process.env.REDIS_URL || 'redis://redis:6379';
const r = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 5000 });
r.ping().then(() => { console.log('PONG'); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => r.disconnect());
" 2>/dev/null | grep -q PONG; then
    log_success "Redis reachable from auth container"
  else
    log_error "Redis not reachable from auth container"
  fi
else
  log_warning "dental-saas-auth is not running — start with: make docker-up-apps"
fi

if [ -n "$EMAIL" ]; then
  log_step "4. User row + password identity + tenant membership"
  docker exec dental-saas-postgres psql -U postgres -d dental_saas -v ON_ERROR_STOP=1 <<EOF
SELECT u.id, u.email, u.status,
       uai.provider,
       (uai.password_hash IS NOT NULL) AS has_password,
       ut.tenant_id,
       ut.user_type
FROM users u
LEFT JOIN user_auth_identities uai ON uai.user_id = u.id AND uai.provider = 'password'
LEFT JOIN user_tenants ut ON ut.user_id = u.id
WHERE lower(u.email) = lower('$EMAIL');
EOF
  log_info "Login requires: has_password = t, tenant_id = $TENANT_ID (or use that tenantId in the login body)"
fi

if [ -n "$EMAIL" ] && [ -n "$PASSWORD" ]; then
  log_step "5. POST login (direct auth :4001)"
  body=$(curl -s -w "\n__HTTP__%{http_code}" -X POST "http://localhost:4001/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}" 2>/dev/null || echo "__HTTP__000")
  http_code="${body##*$'\n'__HTTP__}"
  response="${body%$'\n'__HTTP__*}"
  log_info "HTTP $http_code"
  echo "$response" | head -c 800
  echo ""
  if [ "$http_code" = "200" ]; then
    log_success "Login succeeded on auth service"
  elif [ "$http_code" = "401" ]; then
    log_warning "401 — wrong password, no password identity, or tenantId mismatch"
  elif [ "$http_code" = "503" ]; then
    log_error "503 — Redis or DB sessions table (see message above)"
  else
    log_error "Unexpected status $http_code — check: docker logs dental-saas-auth --tail 40"
  fi

  log_step "6. POST login (via gateway :4000)"
  body2=$(curl -s -w "\n__HTTP__%{http_code}" -X POST "http://localhost:4000/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}" 2>/dev/null || echo "__HTTP__000")
  http_code2="${body2##*$'\n'__HTTP__}"
  response2="${body2%$'\n'__HTTP__*}"
  log_info "Gateway HTTP $http_code2"
  echo "$response2" | head -c 800
  echo ""
fi

echo ""
log_info "Rebuild auth after code changes:"
echo "  docker compose -f infrastructure/docker/docker-compose.yml --profile apps build auth"
echo "  docker compose -f infrastructure/docker/docker-compose.yml --profile apps up -d auth"
print_separator
