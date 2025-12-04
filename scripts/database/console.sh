#!/bin/bash
# scripts/database/console.sh
# Open database console (psql)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

ENVIRONMENT=${1:-local}

print_header "Database Console: $ENVIRONMENT"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
  log_error "Invalid environment: $ENVIRONMENT"
  log_info "Valid options: local, staging, production"
  exit 1
fi

case "$ENVIRONMENT" in
  local)
    log_step "Connecting to local PostgreSQL (Docker)..."
    echo ""
    log_info "Database: dental_saas"
    log_info "User: postgres"
    echo ""
    log_info "Tip: Type '\q' to exit, '\dt' to list tables, '\l' to list databases"
    echo ""
    
    # Check if container is running
    if ! docker ps --filter "name=dental-saas-postgres" --format "{{.Names}}" | grep -q "dental-saas-postgres"; then
      log_error "PostgreSQL container is not running"
      log_info "Start it with: make docker-up"
      exit 1
    fi
    
    # Connect to PostgreSQL in Docker container
    docker exec -it dental-saas-postgres psql -U postgres -d dental_saas
    ;;
    
  staging)
    log_step "Connecting to staging PostgreSQL..."
    log_warning "Staging database connection not yet configured"
    echo ""
    log_info "To configure:"
    echo "  1. Get database endpoint from Terraform outputs"
    echo "  2. Set DATABASE_URL in your environment"
    echo "  3. Or use AWS RDS connection string"
    echo ""
    log_info "Example:"
    echo "  psql \$DATABASE_URL"
    exit 1
    ;;
    
  production)
    log_step "Connecting to production PostgreSQL..."
    log_error "Direct production database access requires explicit approval"
    echo ""
    log_info "For production database access:"
    echo "  1. Ensure you have proper authorization"
    echo "  2. Use AWS Session Manager or bastion host"
    echo "  3. Enable database logging for audit trail"
    echo ""
    log_info "Contact DevOps team for production access"
    exit 1
    ;;
esac
