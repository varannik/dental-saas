#!/bin/bash
# scripts/lib/docker.sh
# Docker-specific helper functions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

COMPOSE_FILE="${PROJECT_ROOT}/infrastructure/docker/docker-compose.yml"

# Check if Docker is installed
check_docker() {
  if ! command_exists docker; then
    log_error "Docker is not installed"
    log_info "Install Docker: https://docs.docker.com/get-docker/"
    return 1
  fi
  
  log_success "Docker is installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
  return 0
}

# Check if Docker is running
check_docker_running() {
  if ! docker info >/dev/null 2>&1; then
    log_error "Docker is not running"
    log_info "Start Docker Desktop or run: sudo systemctl start docker"
    return 1
  fi
  
  log_success "Docker is running"
  return 0
}

# Check if Docker Compose is installed
check_docker_compose() {
  if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
    log_error "Docker Compose is not installed"
    return 1
  fi
  
  log_success "Docker Compose is installed"
  return 0
}

# Get Docker Compose command (v1 or v2)
get_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command_exists docker-compose; then
    echo "docker-compose"
  else
    log_error "Docker Compose not found"
    return 1
  fi
}

# Check if container is running
container_running() {
  local container_name=$1
  docker ps --format '{{.Names}}' | grep -q "^${container_name}$"
}

# Check if container exists (running or stopped)
container_exists() {
  local container_name=$1
  docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"
}

# Start Docker containers
start_containers() {
  local compose_cmd=$(get_compose_cmd)
  log_info "Starting Docker containers..."
  $compose_cmd -f "$COMPOSE_FILE" up -d
  log_success "Docker containers started"
}

# Stop Docker containers
stop_containers() {
  local compose_cmd=$(get_compose_cmd)
  log_info "Stopping Docker containers..."
  $compose_cmd -f "$COMPOSE_FILE" down
  log_success "Docker containers stopped"
}

# Restart Docker containers
restart_containers() {
  local compose_cmd=$(get_compose_cmd)
  log_info "Restarting Docker containers..."
  $compose_cmd -f "$COMPOSE_FILE" restart
  log_success "Docker containers restarted"
}

# Show Docker container logs
show_logs() {
  local compose_cmd=$(get_compose_cmd)
  $compose_cmd -f "$COMPOSE_FILE" logs -f
}

# Clean Docker containers and volumes
clean_containers() {
  local compose_cmd=$(get_compose_cmd)
  
  if ! confirm "This will remove all containers and volumes. Continue?" "n"; then
    log_warning "Operation cancelled"
    return 1
  fi
  
  log_info "Removing Docker containers and volumes..."
  $compose_cmd -f "$COMPOSE_FILE" down -v
  log_success "Docker cleaned"
}

# Show Docker container status
show_status() {
  local compose_cmd=$(get_compose_cmd)
  $compose_cmd -f "$COMPOSE_FILE" ps
}

# Ensure container is running
ensure_container_running() {
  local container_name=$1
  local service_name=$2
  
  if container_running "$container_name"; then
    log_info "$container_name is already running"
    return 0
  fi
  
  if container_exists "$container_name"; then
    log_info "Starting existing $container_name container..."
    docker start "$container_name"
  else
    log_info "Creating and starting $container_name container..."
    local compose_cmd=$(get_compose_cmd)
    $compose_cmd -f "$COMPOSE_FILE" up -d "$service_name"
  fi
  
  log_success "$container_name is running"
  return 0
}

# Wait for PostgreSQL to be ready
wait_for_postgres() {
  local container_name=${1:-dental-saas-postgres}
  wait_for_service "PostgreSQL" \
    "docker exec $container_name pg_isready -U postgres" \
    30
}

# Wait for Redis to be ready
wait_for_redis() {
  local container_name=${1:-dental-saas-redis}
  wait_for_service "Redis" \
    "docker exec $container_name redis-cli ping | grep -q PONG" \
    30
}

# Wait for MinIO to be ready
wait_for_minio() {
  local container_name=${1:-dental-saas-minio}
  wait_for_service "MinIO" \
    "curl -sf http://localhost:9000/minio/health/live" \
    30
}

# Get container IP address
get_container_ip() {
  local container_name=$1
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container_name"
}

# Execute command in container
exec_in_container() {
  local container_name=$1
  shift
  docker exec -it "$container_name" "$@"
}

# Copy file to container
copy_to_container() {
  local source=$1
  local container_name=$2
  local dest=$3
  docker cp "$source" "$container_name:$dest"
}

# Copy file from container
copy_from_container() {
  local container_name=$1
  local source=$2
  local dest=$3
  docker cp "$container_name:$source" "$dest"
}

