#!/bin/bash
# scripts/docker/status.sh
# Show Docker container status

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"

print_header "Show Docker Container Status"

check_docker || die "Docker is required"

if ! check_docker_running; then
  log_warning "Docker daemon is not running; no container status available"
  exit 0
fi

check_docker_compose || die "Docker Compose is required"

if [ ! -f "$COMPOSE_FILE" ]; then
  die "Compose file not found: $COMPOSE_FILE"
fi

log_step "Listing Docker Compose service status..."
show_status

echo ""
log_success "Container status displayed"
