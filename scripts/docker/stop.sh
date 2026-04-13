#!/bin/bash
# scripts/docker/stop.sh
# Stop Docker containers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

print_header "Stop Docker Containers"

# Validate prerequisites
check_docker || die "Docker is required"
check_docker_running || die "Docker daemon is not running"
check_docker_compose || die "Docker Compose is required"

if [ ! -f "$COMPOSE_FILE" ]; then
  die "Compose file not found: $COMPOSE_FILE"
fi

log_step "Stopping local infrastructure containers..."
stop_containers

print_separator
log_success "Docker containers stopped"
print_separator
echo ""
