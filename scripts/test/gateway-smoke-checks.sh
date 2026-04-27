#!/bin/bash
# scripts/test/gateway-smoke-checks.sh
# Run gateway full-flow smoke checks:
# 1) Register
# 2) Login
# 3) Get profile
# 4) Create tenant
# 5) Create user (users service via gateway)
# 6) List users
# 7) Get user by id
# 8) Patch user
# 9) Delete user

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
CRUD_USER_EMAIL="crud.itest.$(date +%s)@example.com"
TEST_PASSWORD=${SMOKE_TEST_PASSWORD:-"SecurePass123"}
CREATED_TENANT_NAME="Gateway Tenant Smoke $(date +%s)"
ACCESS_TOKEN=""
CRUD_USER_ID=""

log_info "Gateway base URL: $BASE_URL"
log_info "Smoke tenant id: $TEST_TENANT_ID"
log_info "Smoke email (auth): $TEST_EMAIL"
log_info "Smoke email (users CRUD): $CRUD_USER_EMAIL"

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
    -v crud_email="$CRUD_USER_EMAIL" \
    -v tenant_name="$CREATED_TENANT_NAME" <<'SQL' >/dev/null
begin;

with user_ids as (
  select id
  from users
  where email in (:'test_email', :'crud_email')
)
delete from sessions where user_id in (select id from user_ids);

with user_ids as (
  select id
  from users
  where email in (:'test_email', :'crud_email')
)
delete from user_auth_identities where user_id in (select id from user_ids);

with user_ids as (
  select id
  from users
  where email in (:'test_email', :'crud_email')
)
delete from user_tenants where user_id in (select id from user_ids);

delete from users where email in (:'test_email', :'crud_email');
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

http_patch_json() {
  local url="$1"
  local payload="$2"
  local auth_header="$3"
  curl -sS -w "\nHTTP_STATUS:%{http_code}" \
    -X PATCH "$url" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $auth_header" \
    -d "$payload"
}

http_delete_auth() {
  local url="$1"
  local auth_header="$2"
  curl -sS -w "\nHTTP_STATUS:%{http_code}" \
    -X DELETE "$url" \
    -H "Authorization: Bearer $auth_header"
}

parse_status() {
  echo "$1" | sed -n 's/^HTTP_STATUS://p'
}

parse_body() {
  echo "$1" | sed '/^HTTP_STATUS:/d'
}

mask_login_tokens() {
  local login_body="$1"
  LOGIN_JSON="$login_body" node -e "
try {
  const body = JSON.parse(process.env.LOGIN_JSON ?? '{}');
  if (typeof body.accessToken === 'string' && body.accessToken.length > 0) {
    body.accessToken = '[REDACTED]';
  }
  if (typeof body.refreshToken === 'string' && body.refreshToken.length > 0) {
    body.refreshToken = '[REDACTED]';
  }
  process.stdout.write(JSON.stringify(body));
} catch {
  process.stdout.write('{\"error\":\"unable to parse login response\"}');
}
"
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

log_step "Step 1/9: register via gateway"
REGISTER_RAW=$(http_post_json \
  "$BASE_URL/api/v1/auth/register" \
  "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"fullName\":\"Integration User\",\"tenantId\":\"$TEST_TENANT_ID\"}")
REGISTER_STATUS=$(parse_status "$REGISTER_RAW")
REGISTER_BODY=$(parse_body "$REGISTER_RAW")
expect_status "$REGISTER_STATUS" "201" "Register" "$REGISTER_BODY"
log_success "Register passed"

log_step "Step 2/9: login via gateway"
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

log_step "Step 3/9: get profile via gateway"
ME_RAW=$(http_get_auth "$BASE_URL/api/v1/auth/me" "$ACCESS_TOKEN")
ME_STATUS=$(parse_status "$ME_RAW")
ME_BODY=$(parse_body "$ME_RAW")
expect_status "$ME_STATUS" "200" "Get profile" "$ME_BODY"
log_success "Get profile passed"

log_step "Step 4/9: create tenant via gateway"
CREATE_TENANT_RAW=$(http_post_json \
  "$BASE_URL/api/v1/tenants" \
  "{\"name\":\"$CREATED_TENANT_NAME\",\"type\":\"SOLO_PRACTICE\"}" \
  "$ACCESS_TOKEN")
CREATE_TENANT_STATUS=$(parse_status "$CREATE_TENANT_RAW")
CREATE_TENANT_BODY=$(parse_body "$CREATE_TENANT_RAW")
expect_status "$CREATE_TENANT_STATUS" "201" "Create tenant" "$CREATE_TENANT_BODY"
log_success "Create tenant passed"

log_step "Step 5/9: create user via gateway"
CREATE_USER_RAW=$(http_post_json \
  "$BASE_URL/api/v1/users" \
  "{\"email\":\"$CRUD_USER_EMAIL\",\"fullName\":\"CRUD Smoke User\",\"tenantId\":\"$TEST_TENANT_ID\"}" \
  "$ACCESS_TOKEN")
CREATE_USER_STATUS=$(parse_status "$CREATE_USER_RAW")
CREATE_USER_BODY=$(parse_body "$CREATE_USER_RAW")
expect_status "$CREATE_USER_STATUS" "201" "Create user" "$CREATE_USER_BODY"
CRUD_USER_ID=$(echo "$CREATE_USER_BODY" | node -e "process.stdin.on('data', d => { try { const body = JSON.parse(d.toString()); process.stdout.write(body.user?.id ?? ''); } catch { process.stdout.write(''); } });")
if [ -z "$CRUD_USER_ID" ]; then
  log_error "Create user failed: missing user.id in response"
  exit 1
fi
if ! CREATED_ID="$CRUD_USER_ID" CREATED_EMAIL="$CRUD_USER_EMAIL" CREATED_JSON="$CREATE_USER_BODY" node -e "
try {
  const id = process.env.CREATED_ID;
  const email = process.env.CREATED_EMAIL;
  const body = JSON.parse(process.env.CREATED_JSON ?? '{}');
  const createdUser = body.user ?? {};
  if (createdUser.id !== id || createdUser.email !== email) process.exit(1);
} catch {
  process.exit(1);
}
"; then
  log_error "Create user failed: response payload does not match requested user"
  log_info "Create user response body: $CREATE_USER_BODY"
  exit 1
fi
log_success "Create user passed"

log_step "Step 6/9: list users via gateway"
LIST_USERS_RAW=$(http_get_auth "$BASE_URL/api/v1/users?tenantId=$TEST_TENANT_ID" "$ACCESS_TOKEN")
LIST_USERS_STATUS=$(parse_status "$LIST_USERS_RAW")
LIST_USERS_BODY=$(parse_body "$LIST_USERS_RAW")
expect_status "$LIST_USERS_STATUS" "200" "List users" "$LIST_USERS_BODY"
if ! CRUD_ID="$CRUD_USER_ID" LIST_JSON="$LIST_USERS_BODY" node -e "
try {
  const id = process.env.CRUD_ID;
  const body = JSON.parse(process.env.LIST_JSON ?? '{}');
  const users = body.users || [];
  if (!users.some((u) => u.id === id)) process.exit(1);
} catch {
  process.exit(1);
}
"; then
  log_error "List users: created user id not present in list"
  log_info "List users response body: $LIST_USERS_BODY"
  exit 1
fi
log_success "List users passed"

log_step "Step 7/9: get user by id via gateway"
GET_USER_RAW=$(http_get_auth "$BASE_URL/api/v1/users/$CRUD_USER_ID" "$ACCESS_TOKEN")
GET_USER_STATUS=$(parse_status "$GET_USER_RAW")
GET_USER_BODY=$(parse_body "$GET_USER_RAW")
expect_status "$GET_USER_STATUS" "200" "Get user" "$GET_USER_BODY"
if ! GET_ID="$CRUD_USER_ID" GET_EMAIL="$CRUD_USER_EMAIL" GET_JSON="$GET_USER_BODY" node -e "
try {
  const id = process.env.GET_ID;
  const email = process.env.GET_EMAIL;
  const body = JSON.parse(process.env.GET_JSON ?? '{}');
  const user = body.user ?? {};
  if (user.id !== id || user.email !== email) process.exit(1);
} catch {
  process.exit(1);
}
"; then
  log_error "Get user failed: returned user does not match created user"
  log_info "Get user response body: $GET_USER_BODY"
  exit 1
fi
log_success "Get user passed"

log_step "Step 8/9: patch user via gateway"
PATCH_USER_RAW=$(http_patch_json \
  "$BASE_URL/api/v1/users/$CRUD_USER_ID" \
  "{\"fullName\":\"CRUD Smoke User Updated\"}" \
  "$ACCESS_TOKEN")
PATCH_USER_STATUS=$(parse_status "$PATCH_USER_RAW")
PATCH_USER_BODY=$(parse_body "$PATCH_USER_RAW")
expect_status "$PATCH_USER_STATUS" "200" "Patch user" "$PATCH_USER_BODY"
if ! PATCH_ID="$CRUD_USER_ID" PATCH_JSON="$PATCH_USER_BODY" node -e "
try {
  const id = process.env.PATCH_ID;
  const body = JSON.parse(process.env.PATCH_JSON ?? '{}');
  const user = body.user ?? {};
  if (user.id !== id || user.fullName !== 'CRUD Smoke User Updated') process.exit(1);
} catch {
  process.exit(1);
}
"; then
  log_error "Patch user failed: response payload did not reflect update"
  log_info "Patch user response body: $PATCH_USER_BODY"
  exit 1
fi
log_success "Patch user passed"

log_step "Step 9/9: delete user via gateway"
DELETE_USER_RAW=$(http_delete_auth "$BASE_URL/api/v1/users/$CRUD_USER_ID?tenantId=$TEST_TENANT_ID" "$ACCESS_TOKEN")
DELETE_USER_STATUS=$(parse_status "$DELETE_USER_RAW")
DELETE_USER_BODY=$(parse_body "$DELETE_USER_RAW")
expect_status "$DELETE_USER_STATUS" "204" "Delete user" "$DELETE_USER_BODY"
CRUD_USER_ID=""
log_success "Delete user passed"

print_separator
log_success "Gateway smoke checks passed"
print_separator
LOGIN_BODY_SAFE=$(mask_login_tokens "$LOGIN_BODY")
echo "REGISTER_RESPONSE=$REGISTER_BODY"
echo "LOGIN_RESPONSE=$LOGIN_BODY_SAFE"
echo "ME_RESPONSE=$ME_BODY"
echo "CREATE_TENANT_RESPONSE=$CREATE_TENANT_BODY"
echo "CREATE_USER_RESPONSE=$CREATE_USER_BODY"
echo "LIST_USERS_RESPONSE=$LIST_USERS_BODY"
echo "GET_USER_RESPONSE=$GET_USER_BODY"
echo "PATCH_USER_RESPONSE=$PATCH_USER_BODY"
echo "DELETE_USER_HTTP_STATUS=$DELETE_USER_STATUS"
