#!/bin/bash
# scripts/local/start.sh
# Start complete local development environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"
source "$SCRIPT_DIR/../lib/terraform.sh"

print_header "Starting Local Development Environment"

# Step 1: Check dependencies
log_step "Checking dependencies..."
if ! "$SCRIPT_DIR/../setup/check-dependencies.sh"; then
  die "Dependencies check failed. Run 'make install-tools' to install missing tools."
fi

# Step 2: Start Docker containers
log_step "Starting Docker containers..."
ensure_container_running "dental-saas-postgres" "postgres"
ensure_container_running "dental-saas-redis" "redis"
ensure_container_running "dental-saas-minio" "minio"

# Step 3: Wait for services to be ready
log_step "Waiting for services to be ready..."
wait_for_postgres "dental-saas-postgres"
wait_for_redis "dental-saas-redis"
wait_for_minio "dental-saas-minio"

# Step 4: Apply Terraform configuration
log_step "Applying Terraform configuration..."
apply_terraform "local" "true"

# Step 5: Get connection info
log_step "Getting connection information..."
DB_ENDPOINT=$(get_terraform_output "db_endpoint" "local")
DB_NAME=$(get_terraform_output "db_name" "local")
REDIS_ENDPOINT=$(get_terraform_output "redis_endpoint" "local")
S3_ENDPOINT=$(get_terraform_output "s3_endpoint" "local")

log_info "Database: $DB_ENDPOINT/$DB_NAME"
log_info "Redis: $REDIS_ENDPOINT"
log_info "S3 (MinIO): $S3_ENDPOINT"

# Step 6: Run database migrations
if [ -f "$PROJECT_ROOT/package.json" ]; then
  log_step "Running database migrations..."
  cd "$PROJECT_ROOT"
  npm run db:migrate || log_warning "Migration failed (database may not be ready yet)"
  cd - >/dev/null
fi

# Step 7: Seed database
if [ -f "$PROJECT_ROOT/package.json" ]; then
  log_step "Seeding database..."
  cd "$PROJECT_ROOT"
  npm run db:seed || log_warning "Seeding failed"
  cd - >/dev/null
fi

print_separator
log_success "Local development environment is ready!"
print_separator

echo ""
log_info "Next steps:"
echo "  • Run 'make dev' to start the development server"
echo "  • Run 'make db-console' to access PostgreSQL"
echo "  • Run 'make redis-console' to access Redis"
echo "  • Visit http://localhost:9001 for MinIO console (minioadmin/minioadmin)"
echo ""
log_info "Useful commands:"
echo "  • make local-stop    - Stop local environment"
echo "  • make local-restart - Restart local environment"
echo "  • make local-reset   - Reset local environment (clean slate)"
echo "  • make logs          - View Docker logs"
echo ""

