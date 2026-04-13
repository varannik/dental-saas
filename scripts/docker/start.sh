#!/bin/bash
# scripts/docker/start.sh
# Start Docker containers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

print_header "Start Docker Containers"

# Validate prerequisites
check_docker || die "Docker is required"
check_docker_running || die "Docker daemon is not running"
check_docker_compose || die "Docker Compose is required"

if [ ! -f "$COMPOSE_FILE" ]; then
  die "Compose file not found: $COMPOSE_FILE"
fi

log_step "Starting local infrastructure containers..."
start_containers

log_step "Waiting for core services..."
wait_for_postgres "dental-saas-postgres"
wait_for_redis "dental-saas-redis"
wait_for_minio "dental-saas-minio"

print_separator
log_success "Docker stack is ready"
print_separator
echo ""
log_info "Services:"
echo "  • PostgreSQL: localhost:5432"
echo "  • Redis:      localhost:6379"
echo "  • MinIO API:  http://localhost:9000"
echo "  • MinIO UI:   http://localhost:9001"
echo ""
