#!/bin/bash
# scripts/dev/start-services.sh
# Start all microservices

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

print_header "Start all microservices"

if ! command_exists pnpm; then
  die "pnpm is required to start services"
fi

if ! command_exists curl; then
  die "curl is required for health checks"
fi

if ! command_exists lsof; then
  die "lsof is required to validate service ports"
fi

check_docker || die "Docker is required for local dependencies"
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

# docker-compose may run auth/clinical, which conflict with local dev on 4001/4003.
if container_running "dental-saas-auth"; then
  log_info "Stopping docker auth container to free port 4001..."
  docker stop dental-saas-auth >/dev/null
  log_success "Stopped dental-saas-auth container"
fi

if container_running "dental-saas-clinical"; then
  log_info "Stopping docker clinical container to free port 4003..."
  docker stop dental-saas-clinical >/dev/null
  log_success "Stopped dental-saas-clinical container"
fi

RUN_DIR="$PROJECT_ROOT/.run"
LOG_DIR="$PROJECT_ROOT/.run/logs"
mkdir -p "$RUN_DIR" "$LOG_DIR"

# PID files reference the previous launcher; clear them whenever we reconcile ports.
rm -f "$RUN_DIR/auth.pid" "$RUN_DIR/users.pid" "$RUN_DIR/clinical.pid" "$RUN_DIR/gateway.pid"

DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5432/dental_saas"}
REDIS_URL=${REDIS_URL:-"redis://127.0.0.1:6379"}
JWT_SECRET=${JWT_SECRET:-"dev-only-jwt-secret-change-me-immediately"}
AUTH_SERVICE_URL=${AUTH_SERVICE_URL:-"http://127.0.0.1:4001"}
USERS_SERVICE_URL=${USERS_SERVICE_URL:-"http://127.0.0.1:4002"}
CLINICAL_SERVICE_URL=${CLINICAL_SERVICE_URL:-"http://127.0.0.1:4003"}

port_is_listening() {
  local port="$1"
  lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1
}

listeners_on_port() {
  local port="$1"
  # LISTEN avoids unrelated client sockets on ephemeral ports talking to localhost.
  lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true
}

stop_existing_listener_if_any() {
  local port="$1"
  local service_name="$2"

  if ! port_is_listening "$port"; then
    return 0
  fi

  local pids
  pids=$(listeners_on_port "$port")
  if [ -z "$pids" ]; then
    pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
  fi

  local pid_list
  pid_list="$(printf '%s\n' "$pids" | sort -u | tr '\n' ' ' | sed 's/ *$//')"

  log_info "$service_name: port $port is in use (pid: $pid_list). Stopping before start..."
  for pid in $(printf '%s\n' "$pids" | sort -u); do
    case "$pid" in
      '' | *[!0-9]*) continue ;;
      *) kill -TERM "$pid" 2>/dev/null || true ;;
    esac
  done

  local attempt=1
  local max_attempts=40
  while port_is_listening "$port"; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      log_warning "$service_name: still listening after SIGTERM; forcing shutdown (SIGKILL)..."
      local killer_pids
      killer_pids=$(listeners_on_port "$port")
      if [ -z "$killer_pids" ]; then
        killer_pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
      fi
      for pid in $(printf '%s\n' "$killer_pids" | sort -u); do
        case "$pid" in
          '' | *[!0-9]*) continue ;;
          *) kill -9 "$pid" 2>/dev/null || true ;;
        esac
      done
      sleep 1
      break
    fi
    sleep 0.5
    attempt=$((attempt + 1))
  done

  if port_is_listening "$port"; then
    log_error "$service_name cannot start: port $port is still in use"
    log_info "Stop the process on port $port, then rerun this command."
    exit 1
  fi
  log_success "$service_name: previous listener on port $port stopped"
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local expected_statuses="${3:-200}"
  local max_attempts=40
  local attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
    IFS=',' read -r -a expected_array <<<"$expected_statuses"
    for expected in "${expected_array[@]}"; do
      if [ "$status" = "$expected" ]; then
        log_success "$name is healthy ($url -> $status)"
        return 0
      fi
    done
    sleep 1
    attempt=$((attempt + 1))
  done
  log_error "$name failed health check at $url (expected: $expected_statuses)"
  return 1
}

start_service() {
  local name="$1"
  local command="$2"
  local log_file="$3"
  local pid_file="$4"

  log_step "Starting $name..."
  nohup bash -lc "$command" >"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"
  log_info "$name started (pid=$pid, log=$log_file)"
}

log_step "Reconciling ports (stop any existing listener before start)..."
stop_existing_listener_if_any 4001 "Auth service"
stop_existing_listener_if_any 4002 "Users service"
stop_existing_listener_if_any 4003 "Clinical service"
stop_existing_listener_if_any 4000 "API gateway"

start_service \
  "auth service" \
  "cd \"$PROJECT_ROOT\" && DATABASE_URL=\"$DATABASE_URL\" REDIS_URL=\"$REDIS_URL\" JWT_SECRET=\"$JWT_SECRET\" pnpm --filter @saas/auth exec tsx src/index.ts" \
  "$LOG_DIR/auth.log" \
  "$RUN_DIR/auth.pid"

start_service \
  "users service" \
  "cd \"$PROJECT_ROOT\" && DATABASE_URL=\"$DATABASE_URL\" REDIS_URL=\"$REDIS_URL\" JWT_SECRET=\"$JWT_SECRET\" pnpm --filter @saas/users exec tsx src/index.ts" \
  "$LOG_DIR/users.log" \
  "$RUN_DIR/users.pid"

start_service \
  "clinical service" \
  "cd \"$PROJECT_ROOT\" && DATABASE_URL=\"$DATABASE_URL\" JWT_SECRET=\"$JWT_SECRET\" JWT_ISSUER=\"${JWT_ISSUER:-dental-saas}\" pnpm --filter @saas/clinical exec tsx src/index.ts" \
  "$LOG_DIR/clinical.log" \
  "$RUN_DIR/clinical.pid"

start_service \
  "api gateway" \
  "cd \"$PROJECT_ROOT\" && JWT_SECRET=\"$JWT_SECRET\" REDIS_URL=\"$REDIS_URL\" AUTH_SERVICE_URL=\"$AUTH_SERVICE_URL\" USERS_SERVICE_URL=\"$USERS_SERVICE_URL\" CLINICAL_SERVICE_URL=\"$CLINICAL_SERVICE_URL\" pnpm --filter @saas/api-gateway exec tsx src/index.ts" \
  "$LOG_DIR/gateway.log" \
  "$RUN_DIR/gateway.pid"

wait_for_http "http://localhost:4001/auth/me" "Auth service" "200,401"
wait_for_http "http://localhost:4002/health" "Users service"
wait_for_http "http://localhost:4003/health" "Clinical service"
wait_for_http "http://localhost:4000/health" "API gateway"

print_separator
log_success "All services are running."
log_info "Logs:"
echo "  - $LOG_DIR/auth.log"
echo "  - $LOG_DIR/users.log"
echo "  - $LOG_DIR/clinical.log"
echo "  - $LOG_DIR/gateway.log"
print_separator
