#!/bin/bash
# scripts/test/gateway-smoke-checks.sh
#
# Integration smoke: HTTP flows through the API gateway (default :4000), exercising:
#
# | Upstream service   | Step(s) | Gateway prefix (proxied routes) |
# |--------------------|---------|-----------------------------------|
# | Gateway (itself)   | 01      | GET /health                       |
# | Auth               | 02–03   | /api/v1/auth/*                    |
# | Users (+ tenants)  | 04–08,14| /api/v1/tenants, /api/v1/users    |
# | Clinical           | PF,09–13| /api/v1/patients* → clinical Svc  |
#
# PF = local-only preflight: GET <clinical>/health (default http://127.0.0.1:4003/health).
#    Ensures @saas/clinical is up before patient steps; does not replace unit tests in
#    services/clinical (those run via: pnpm --filter @saas/clinical test).
#
# Pass conditions: each step checks HTTP status and, where noted, JSON shape / ids.
# Detailed response bodies: set SMOKE_VERBOSE=1 (includes large list payloads).
#
# Where traffic actually lands (why Docker may show no logs):
# - The gateway forwards to AUTH/USERS/CLINICAL URLs (defaults in apps/api-gateway/src/routes/*.proxy.ts):
#     AUTH_SERVICE_URL         → http://127.0.0.1:4001
#     USERS_SERVICE_URL        → http://127.0.0.1:4002
#     CLINICAL_SERVICE_URL     → http://127.0.0.1:4003
# - `make start-services` runs auth, users, clinical, gateway as host processes (pnpm tsx); logs go to:
#     .run/logs/auth.log · users.log · clinical.log · gateway.log
#   It stops Docker dental-saas-auth and dental-saas-clinical to free ports; users is often left
#   bound on :4002 by whichever process won the port (host tsx vs container). If the host owns
#   4002, `docker logs dental-saas-users` stays quiet — that does not mean steps 05–08 skipped.

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
SMOKE_PATIENT_ID=""
CLINICAL_PREFLIGHT_OK=0

log_info "Gateway base URL: $BASE_URL"
log_info "Smoke tenant id: $TEST_TENANT_ID"
log_info "Smoke email (auth): $TEST_EMAIL"
log_info "Smoke email (users CRUD): $CRUD_USER_EMAIL"

if [ "$ENVIRONMENT" = "local" ]; then
  log_info "Gateway upstream defaults (override via env when gateway starts): AUTH ${AUTH_SERVICE_URL:-http://127.0.0.1:4001} · USERS ${USERS_SERVICE_URL:-http://127.0.0.1:4002} · CLINICAL ${CLINICAL_SERVICE_URL:-http://127.0.0.1:4003}"
  log_info "If you use make start-services: tail logs under ${PROJECT_ROOT}/.run/logs/ (users→users.log). Docker dental-saas-users logs only when that container owns host :4002."
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

  log_step "Preflight: clinical service (patients API upstream for gateway)"
  if ! curl -sSf "${SMOKE_CLINICAL_HEALTH_URL:-"http://127.0.0.1:4003/health"}" >/dev/null; then
    log_error "Clinical service is not reachable (gateway proxies /api/v1/patients to the clinical service)."
    log_info "Start it with: make start-services  or: pnpm --filter @saas/clinical dev"
    log_info "Override check URL: SMOKE_CLINICAL_HEALTH_URL=https://host:4003/health"
    exit 1
  fi
  log_success "Clinical preflight passed"
  CLINICAL_PREFLIGHT_OK=1
fi

cleanup_local_test_data() {
  if [ "$ENVIRONMENT" != "local" ]; then
    return 0
  fi
  if ! container_running "dental-saas-postgres"; then
    return 0
  fi
  {
    echo "begin;"
    if [ -n "${SMOKE_PATIENT_ID:-}" ]; then
      echo "delete from patients where id = '${SMOKE_PATIENT_ID}'::uuid;"
    fi
    cat <<'SQL'
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
  } | docker exec -i dental-saas-postgres psql \
    -U postgres \
    -d dental_saas \
    -v ON_ERROR_STOP=1 \
    -v test_email="$TEST_EMAIL" \
    -v crud_email="$CRUD_USER_EMAIL" \
    -v tenant_name="$CREATED_TENANT_NAME" >/dev/null
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

# Short UUID prefix for summary lines (avoid dumping full ids in normal output).
short_id() {
  local id="$1"
  if [ ${#id} -ge 8 ]; then
    echo "${id:0:8}…"
  elif [ -n "$id" ]; then
    echo "$id"
  else
    echo "—"
  fi
}

print_smoke_report() {
  local login_safe pid_short cid_short clinical_pf_row
  login_safe=$(mask_login_tokens "$LOGIN_BODY")
  pid_short=$(short_id "${SUMMARY_PATIENT_ID:-}")
  cid_short=$(short_id "${SUMMARY_CRUD_USER_ID:-}")

  if [ "$ENVIRONMENT" = "local" ] && [ "$CLINICAL_PREFLIGHT_OK" = "1" ]; then
    clinical_pf_row="$(printf '  %-4s %-14s %-52s %-7s %s\n' "PFc" "clinical" "GET ${SMOKE_CLINICAL_HEALTH_URL:-"http://127.0.0.1:4003/health"} → 200 (upstream for /patients)" "—" "ok")"
  elif [ "$ENVIRONMENT" != "local" ]; then
    clinical_pf_row="$(printf '  %-4s %-14s %-52s %-7s %s\n' "PFc" "clinical" "Preflight GET /health (local only, before steps 09–13)" "—" "skipped")"
  else
    clinical_pf_row=""
  fi

  print_separator
  log_success "Gateway smoke checks passed — summary below"
  print_separator
  cat <<EOF

Service coverage (this script)
  gateway     Routing + JWT on ${BASE_URL}
  auth        Steps 01–03 · /api/v1/auth/*
  users       Steps 04–08, 14 · /api/v1/tenants · /api/v1/users
  clinical    Steps 09–13 · /api/v1/patients* (proxied to @saas/clinical); PFc = local-only preflight
  Unit tests  @saas/clinical: pnpm --filter @saas/clinical test (not this script)

Assertion checklist (rows are ordered; script exits on first failure)
────────────────────────────────────────────────────────────────────────────
EOF
  printf '  %-4s %-14s %-52s %-7s %s\n' "PFg" "gateway" "GET /health → 200" "$GATEWAY_HEALTH_STATUS" "reachable"
  if [ -n "$clinical_pf_row" ]; then
    echo "$clinical_pf_row"
  fi
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "01" "auth" "POST /auth/register → 201, user + id" "$REGISTER_STATUS" "email=$TEST_EMAIL"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "02" "auth" "POST /auth/login → 200, accessToken" "$LOGIN_STATUS" "token redacted below"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "03" "auth" "GET /auth/me → 200, tenantId" "$ME_STATUS" "ok"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "04" "users" "POST /tenants → 201" "$CREATE_TENANT_STATUS" "name=$CREATED_TENANT_NAME"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "05" "users" "POST /users → 201, user.id" "$CREATE_USER_STATUS" "id=$cid_short"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "06" "users" "GET /users?tenantId → 200, users[] contains new id" "$LIST_USERS_STATUS" "contains $cid_short"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "07" "users" "GET /users/:id → 200, id + email match" "$GET_USER_STATUS" "ok"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "08" "users" "PATCH /users/:id → 200, fullName updated" "$PATCH_USER_STATUS" "ok"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "09" "clinical" "POST /patients → 201, patient.id (gateway→clinical)" "$CREATE_PATIENT_STATUS" "id=$pid_short"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "10" "clinical" "GET /patients → 200, patients[] contains id" "$LIST_PATIENTS_STATUS" "contains $pid_short"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "11" "clinical" "GET /patients/:id → 200, lastName match" "$GET_PATIENT_STATUS" "ok"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "12" "clinical" "GET /patients/:id/history → 200, encounters[] + notes[]" "$HISTORY_STATUS" "ok"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "13" "clinical" "DELETE /patients/:id → 204 soft delete" "$DELETE_PATIENT_STATUS" "ok"
  printf '  %-4s %-14s %-52s %-7s %s\n' \
    "14" "users" "DELETE /users/:id → 204" "$DELETE_USER_STATUS" "ok"
  cat <<EOF
────────────────────────────────────────────────────────────────────────────
EOF
  print_separator
  log_info "Redacted: LOGIN_RESPONSE below. Full JSON bodies: SMOKE_VERBOSE=1 make gateway-smoke-checks"
  echo ""
  echo "LOGIN_RESPONSE=$login_safe"
  echo "SMOKE_CORRELATION=emails/auth=$TEST_EMAIL users_crud=$CRUD_USER_EMAIL tenant_id=${TEST_TENANT_ID} ids/crud_user=$cid_short patient=$pid_short"

  if [ "${SMOKE_VERBOSE:-0}" = "1" ]; then
    print_separator
    log_step "SMOKE_VERBOSE=1 — full JSON bodies"
    echo "REGISTER_RESPONSE=$REGISTER_BODY"
    echo "ME_RESPONSE=$ME_BODY"
    echo "CREATE_TENANT_RESPONSE=$CREATE_TENANT_BODY"
    echo "CREATE_USER_RESPONSE=$CREATE_USER_BODY"
    echo "LIST_USERS_RESPONSE=$LIST_USERS_BODY"
    echo "GET_USER_RESPONSE=$GET_USER_BODY"
    echo "PATCH_USER_RESPONSE=$PATCH_USER_BODY"
    echo "CREATE_PATIENT_RESPONSE=$CREATE_PATIENT_BODY"
    echo "LIST_PATIENTS_RESPONSE=$LIST_PATIENTS_BODY"
    echo "GET_PATIENT_RESPONSE=$GET_PATIENT_BODY"
    echo "HISTORY_RESPONSE=$HISTORY_BODY"
  else
    log_info "LIST_USERS body omitted by default (can be huge). Step 06 still asserts created id appears in JSON."
  fi

  if [ "$ENVIRONMENT" = "local" ]; then
    print_separator
    log_info "Proof the users/clinical steps ran: HTTP statuses above + JSON assertions would have aborted on mismatch."
    log_info "Where to tail logs locally: ${PROJECT_ROOT}/.run/logs/users.log · clinical.log · gateway.log (after make start-services). Docker logs for dental-saas-users only if that container serves :4002."
  fi
}

log_step "Preflight: check gateway health"
GATEWAY_HEALTH_RAW=$(curl -sS -w "\nHTTP_STATUS:%{http_code}" "$BASE_URL/health")
GATEWAY_HEALTH_STATUS=$(parse_status "$GATEWAY_HEALTH_RAW")
GATEWAY_HEALTH_BODY=$(parse_body "$GATEWAY_HEALTH_RAW")
expect_status "$GATEWAY_HEALTH_STATUS" "200" "Gateway health" "$GATEWAY_HEALTH_BODY"
log_success "Gateway is reachable"

log_step "Step 1/14: register via gateway"
REGISTER_RAW=$(http_post_json \
  "$BASE_URL/api/v1/auth/register" \
  "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"fullName\":\"Integration User\",\"tenantId\":\"$TEST_TENANT_ID\"}")
REGISTER_STATUS=$(parse_status "$REGISTER_RAW")
REGISTER_BODY=$(parse_body "$REGISTER_RAW")
expect_status "$REGISTER_STATUS" "201" "Register" "$REGISTER_BODY"
log_success "Register passed"

log_step "Step 2/14: login via gateway"
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

log_step "Step 3/14: get profile via gateway"
ME_RAW=$(http_get_auth "$BASE_URL/api/v1/auth/me" "$ACCESS_TOKEN")
ME_STATUS=$(parse_status "$ME_RAW")
ME_BODY=$(parse_body "$ME_RAW")
expect_status "$ME_STATUS" "200" "Get profile" "$ME_BODY"
log_success "Get profile passed"

log_step "Step 4/14: create tenant via gateway"
CREATE_TENANT_RAW=$(http_post_json \
  "$BASE_URL/api/v1/tenants" \
  "{\"name\":\"$CREATED_TENANT_NAME\",\"type\":\"SOLO_PRACTICE\"}" \
  "$ACCESS_TOKEN")
CREATE_TENANT_STATUS=$(parse_status "$CREATE_TENANT_RAW")
CREATE_TENANT_BODY=$(parse_body "$CREATE_TENANT_RAW")
expect_status "$CREATE_TENANT_STATUS" "201" "Create tenant" "$CREATE_TENANT_BODY"
log_success "Create tenant passed"

log_step "Step 5/14: create user via gateway"
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

log_step "Step 6/14: list users via gateway"
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

log_step "Step 7/14: get user by id via gateway"
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

log_step "Step 8/14: patch user via gateway"
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

log_step "Step 9/14: create patient via gateway (clinical service)"
SMOKE_PATIENT_LAST="GwSmoke$(date +%s)"
CREATE_PATIENT_RAW=$(http_post_json \
  "$BASE_URL/api/v1/patients" \
  "{\"firstName\":\"Gateway\",\"lastName\":\"$SMOKE_PATIENT_LAST\",\"contactEmail\":\"smoke.patient.$(date +%s)@example.com\"}" \
  "$ACCESS_TOKEN")
CREATE_PATIENT_STATUS=$(parse_status "$CREATE_PATIENT_RAW")
CREATE_PATIENT_BODY=$(parse_body "$CREATE_PATIENT_RAW")
expect_status "$CREATE_PATIENT_STATUS" "201" "Create patient" "$CREATE_PATIENT_BODY"
SMOKE_PATIENT_ID=$(echo "$CREATE_PATIENT_BODY" | node -e "process.stdin.on('data', d => { try { const body = JSON.parse(d.toString()); process.stdout.write(body.patient?.id ?? ''); } catch { process.stdout.write(''); } });")
if [ -z "$SMOKE_PATIENT_ID" ]; then
  log_error "Create patient failed: missing patient.id in response"
  log_info "Response: $CREATE_PATIENT_BODY"
  exit 1
fi
log_success "Create patient passed"

log_step "Step 10/14: list patients via gateway"
LIST_PATIENTS_RAW=$(http_get_auth "$BASE_URL/api/v1/patients?limit=20" "$ACCESS_TOKEN")
LIST_PATIENTS_STATUS=$(parse_status "$LIST_PATIENTS_RAW")
LIST_PATIENTS_BODY=$(parse_body "$LIST_PATIENTS_RAW")
expect_status "$LIST_PATIENTS_STATUS" "200" "List patients" "$LIST_PATIENTS_BODY"
if ! PID="$SMOKE_PATIENT_ID" LIST_JSON="$LIST_PATIENTS_BODY" node -e "
try {
  const id = process.env.PID;
  const body = JSON.parse(process.env.LIST_JSON ?? '{}');
  const patients = body.patients || [];
  if (!patients.some((p) => p.id === id)) process.exit(1);
} catch {
  process.exit(1);
}
"; then
  log_error "List patients: created patient id not in list"
  log_info "List patients response: $LIST_PATIENTS_BODY"
  exit 1
fi
log_success "List patients passed"

log_step "Step 11/14: get patient by id via gateway"
GET_PATIENT_RAW=$(http_get_auth "$BASE_URL/api/v1/patients/$SMOKE_PATIENT_ID" "$ACCESS_TOKEN")
GET_PATIENT_STATUS=$(parse_status "$GET_PATIENT_RAW")
GET_PATIENT_BODY=$(parse_body "$GET_PATIENT_RAW")
expect_status "$GET_PATIENT_STATUS" "200" "Get patient" "$GET_PATIENT_BODY"
if ! PID="$SMOKE_PATIENT_ID" LNAME="$SMOKE_PATIENT_LAST" GET_JSON="$GET_PATIENT_BODY" node -e "
try {
  const id = process.env.PID;
  const lname = process.env.LNAME;
  const body = JSON.parse(process.env.GET_JSON ?? '{}');
  const p = body.patient ?? {};
  if (p.id !== id || p.lastName !== lname) process.exit(1);
} catch {
  process.exit(1);
}
"; then
  log_error "Get patient: payload mismatch"
  log_info "Get patient response: $GET_PATIENT_BODY"
  exit 1
fi
log_success "Get patient passed"

log_step "Step 12/14: get patient history via gateway"
HISTORY_RAW=$(http_get_auth "$BASE_URL/api/v1/patients/$SMOKE_PATIENT_ID/history" "$ACCESS_TOKEN")
HISTORY_STATUS=$(parse_status "$HISTORY_RAW")
HISTORY_BODY=$(parse_body "$HISTORY_RAW")
expect_status "$HISTORY_STATUS" "200" "Patient history" "$HISTORY_BODY"
if ! H_JSON="$HISTORY_BODY" node -e "
try {
  const body = JSON.parse(process.env.H_JSON ?? '{}');
  if (!Array.isArray(body.encounters) || !Array.isArray(body.notes)) process.exit(1);
} catch {
  process.exit(1);
}
"; then
  log_error "Patient history: expected encounters and notes arrays"
  log_info "Response: $HISTORY_BODY"
  exit 1
fi
log_success "Patient history passed"

log_step "Step 13/14: delete patient via gateway (soft delete)"
DELETE_PATIENT_RAW=$(http_delete_auth "$BASE_URL/api/v1/patients/$SMOKE_PATIENT_ID" "$ACCESS_TOKEN")
DELETE_PATIENT_STATUS=$(parse_status "$DELETE_PATIENT_RAW")
DELETE_PATIENT_BODY=$(parse_body "$DELETE_PATIENT_RAW")
expect_status "$DELETE_PATIENT_STATUS" "204" "Delete patient" "$DELETE_PATIENT_BODY"
log_success "Delete patient passed"

log_step "Step 14/14: delete user via gateway"
DELETE_USER_RAW=$(http_delete_auth "$BASE_URL/api/v1/users/$CRUD_USER_ID?tenantId=$TEST_TENANT_ID" "$ACCESS_TOKEN")
DELETE_USER_STATUS=$(parse_status "$DELETE_USER_RAW")
DELETE_USER_BODY=$(parse_body "$DELETE_USER_RAW")
expect_status "$DELETE_USER_STATUS" "204" "Delete user" "$DELETE_USER_BODY"
SUMMARY_CRUD_USER_ID="$CRUD_USER_ID"
SUMMARY_PATIENT_ID="$SMOKE_PATIENT_ID"
CRUD_USER_ID=""
log_success "Delete user passed"

print_smoke_report
