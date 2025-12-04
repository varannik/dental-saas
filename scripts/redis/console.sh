#!/bin/bash
# scripts/redis/console.sh
# Open Redis CLI console

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

ENVIRONMENT=${1:-local}

print_header "Redis Console: $ENVIRONMENT"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
  log_error "Invalid environment: $ENVIRONMENT"
  log_info "Valid options: local, staging, production"
  exit 1
fi

case "$ENVIRONMENT" in
  local)
    log_step "Connecting to local Redis (Docker)..."
    echo ""
    log_info "Tip: Type 'exit' to quit, 'PING' to test connection, 'KEYS *' to list keys"
    echo ""
    
    # Check if container is running
    if ! docker ps --filter "name=dental-saas-redis" --format "{{.Names}}" | grep -q "dental-saas-redis"; then
      log_error "Redis container is not running"
      log_info "Start it with: make docker-up"
      exit 1
    fi
    
    # Connect to Redis CLI in Docker container
    docker exec -it dental-saas-redis redis-cli
    ;;
    
  staging)
    log_step "Connecting to staging Redis..."
    log_warning "Staging Redis connection not yet configured"
    echo ""
    log_info "To configure:"
    echo "  1. Get Redis endpoint from Terraform outputs"
    echo "  2. Set REDIS_URL in your environment"
    echo "  3. Or use ElastiCache/Upstash connection string"
    echo ""
    log_info "Example:"
    echo "  redis-cli -h \$REDIS_HOST -p \$REDIS_PORT"
    exit 1
    ;;
    
  production)
    log_step "Connecting to production Redis..."
    log_error "Direct production Redis access requires explicit approval"
    echo ""
    log_info "For production Redis access:"
    echo "  1. Ensure you have proper authorization"
    echo "  2. Use secure tunnel or bastion host"
    echo "  3. Enable command logging for audit trail"
    echo ""
    log_info "Contact DevOps team for production access"
    exit 1
    ;;
esac
