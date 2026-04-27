#!/bin/bash
# scripts/test/gateway-smoke-checks.sh
# Run gateway full-flow smoke checks:
# 1) Register
# 2) Login
# 3) Get profile
# 4) Create tenant

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

ENVIRONMENT=${1:-local}
print_header "Gateway smoke checks: $ENVIRONMENT"

if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
  log_error "Invalid environment: $ENVIRONMENT"
  log_info "Valid options: local, staging, production"
  exit 1
fi

if ! command_exists curl; then
  die "curl is required for smoke checks"
fi

if ! command_exists node; then
  die "node is required for JSON parsing"
fi

BASE_URL=${GATEWAY_BASE_URL:-"http://localhost:4000"}
TEST_TENANT_ID=${TEST_TENANT_ID:-"11111111-1111-4111-8111-111111111111"}
TEST_EMAIL="itest.$(date +%s)@example.com"
TEST_PASSWORD=${SMOKE_TEST_PASSWORD:-"SecurePass123"}
CREATED_TENANT_NAME="Gateway Tenant Smoke $(date +%s)"
ACCESS_TOKEN=""

log_info "Gateway base URL: $BASE_URL"
log_info "Smoke tenant id: $TEST_TENANT_ID"
log_info "Smoke email: $TEST_EMAIL"

if [ "$ENVIRONMENT" = "local" ]; then
  check_docker || die "Docker is required for local smoke checks"
  check_docker_running || die "Docker daemon is not running"

  if ! container_running "dental-saas-postgres"; then
    log_error "PostgreSQL container is not running"
    log_info "Run: make docker-up"
    exit 1
  fi

  if ! container_running "dental-saas-redis"; then
    log_error "Redis container is not running"
    log_info "Run: make docker-up"
    exit 1
  fi

  wait_for_postgres "dental-saas-postgres"
  wait_for_redis "dental-saas-redis"
fi

cleanup_local_test_data() {
  if [ "$ENVIRONMENT" != "local" ]; then
    return 0
  fi
  if ! container_running "dental-saas-postgres"; then
    return 0
  fi
  docker exec -i dental-saas-postgres psql \
    -U postgres \
    -d dental_saas \
    -v ON_ERROR_STOP=1 \
    -v test_email="$TEST_EMAIL" \
    -v tenant_name="$CREATED_TENANT_NAME" <<'SQL' >/dev/null
begin;

with user_ids as (
  select id
  from users
  where email = :'test_email'
)
delete from sessions where user_id in (select id from user_ids);

with user_ids as (
  select id
  from users
  where email = :'test_email'
)
delete from user_auth_identities where user_id in (select id from user_ids);

with user_ids as (
  select id
  from users
  where email = :'test_email'
)
delete from user_tenants where user_id in (select id from user_ids);

delete from users where email = :'test_email';
delete from tenants where name = :'tenant_name';

commit;
SQL
}

trap cleanup_local_test_data EXIT

http_post_json() {
  local url="$1"
  local payload="$2"
  local auth_header="${3:-}"
  if [ -n "$auth_header" ]; then
    curl -sS -w "\nHTTP_STATUS:%{http_code}" \
      -X POST "$url" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $auth_header" \
      -d "$payload"
  else
    curl -sS -w "\nHTTP_STATUS:%{http_code}" \
      -X POST "$url" \
      -H "Content-Type: application/json" \
      -d "$payload"
  fi
}

http_get_auth() {
  local url="$1"
  local auth_header="$2"
  curl -sS -w "\nHTTP_STATUS:%{http_code}" \
    "$url" \
    -H "Authorization: Bearer $auth_header"
}

parse_status() {
  echo "$1" | sed -n 's/^HTTP_STATUS://p'
}

parse_body() {
  echo "$1" | sed '/^HTTP_STATUS:/d'
}

expect_status() {
  local actual="$1"
  local expected="$2"
  local step="$3"
  local response_body="${4:-}"
  if [ "$actual" != "$expected" ]; then
    log_error "$step failed: expected status $expected, got $actual"
    if [ -n "$response_body" ]; then
      log_info "$step response body: $response_body"
    fi
    exit 1
  fi
}

log_step "Preflight: check gateway health"
GATEWAY_HEALTH_RAW=$(curl -sS -w "\nHTTP_STATUS:%{http_code}" "$BASE_URL/health")
GATEWAY_HEALTH_STATUS=$(parse_status "$GATEWAY_HEALTH_RAW")
GATEWAY_HEALTH_BODY=$(parse_body "$GATEWAY_HEALTH_RAW")
expect_status "$GATEWAY_HEALTH_STATUS" "200" "Gateway health" "$GATEWAY_HEALTH_BODY"
log_success "Gateway is reachable"

log_step "Step 1/4: register via gateway"
REGISTER_RAW=$(http_post_json \
  "$BASE_URL/api/v1/auth/register" \
  "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"fullName\":\"Integration User\",\"tenantId\":\"$TEST_TENANT_ID\"}")
REGISTER_STATUS=$(parse_status "$REGISTER_RAW")
REGISTER_BODY=$(parse_body "$REGISTER_RAW")
expect_status "$REGISTER_STATUS" "201" "Register" "$REGISTER_BODY"
log_success "Register passed"

log_step "Step 2/4: login via gateway"
LOGIN_RAW=$(http_post_json \
  "$BASE_URL/api/v1/auth/login" \
  "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"tenantId\":\"$TEST_TENANT_ID\"}")
LOGIN_STATUS=$(parse_status "$LOGIN_RAW")
LOGIN_BODY=$(parse_body "$LOGIN_RAW")
expect_status "$LOGIN_STATUS" "200" "Login" "$LOGIN_BODY"
ACCESS_TOKEN=$(echo "$LOGIN_BODY" | node -e "process.stdin.on('data', d => { try { const body = JSON.parse(d.toString()); process.stdout.write(body.accessToken ?? ''); } catch { process.stdout.write(''); } });")
if [ -z "$ACCESS_TOKEN" ]; then
  log_error "Login failed: missing accessToken in response"
  exit 1
fi
log_success "Login passed"

log_step "Step 3/4: get profile via gateway"
ME_RAW=$(http_get_auth "$BASE_URL/api/v1/auth/me" "$ACCESS_TOKEN")
ME_STATUS=$(parse_status "$ME_RAW")
ME_BODY=$(parse_body "$ME_RAW")
expect_status "$ME_STATUS" "200" "Get profile" "$ME_BODY"
log_success "Get profile passed"

log_step "Step 4/4: create tenant via gateway"
CREATE_TENANT_RAW=$(http_post_json \
  "$BASE_URL/api/v1/tenants" \
  "{\"name\":\"$CREATED_TENANT_NAME\",\"type\":\"SOLO_PRACTICE\"}" \
  "$ACCESS_TOKEN")
CREATE_TENANT_STATUS=$(parse_status "$CREATE_TENANT_RAW")
CREATE_TENANT_BODY=$(parse_body "$CREATE_TENANT_RAW")
expect_status "$CREATE_TENANT_STATUS" "201" "Create tenant" "$CREATE_TENANT_BODY"
log_success "Create tenant passed"

print_separator
log_success "Gateway smoke checks passed"
print_separator
echo "REGISTER_RESPONSE=$REGISTER_BODY"
echo "LOGIN_RESPONSE=$LOGIN_BODY"
echo "ME_RESPONSE=$ME_BODY"
echo "CREATE_TENANT_RESPONSE=$CREATE_TENANT_BODY"
