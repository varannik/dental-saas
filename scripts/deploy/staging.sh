#!/bin/bash
# scripts/deploy/staging.sh
# Deploy to staging environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/terraform.sh"

ENVIRONMENT="staging"

print_header "Deploying to Staging"

# Step 1: Check AWS CLI
if ! command_exists aws; then
  die "AWS CLI is not installed. Install: https://aws.amazon.com/cli/"
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  die "AWS CLI is not configured. Run 'aws configure'"
fi

log_success "AWS CLI is configured"

# Step 2: Check git branch
BRANCH=$(get_git_branch)
log_info "Current branch: $BRANCH"

if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "develop" ]; then
  log_warning "You are not on main or develop branch"
  if ! confirm "Continue deployment from $BRANCH?" "n"; then
    die "Deployment cancelled"
  fi
fi

# Step 3: Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  log_warning "You have uncommitted changes"
  if ! confirm "Continue deployment with uncommitted changes?" "n"; then
    die "Deployment cancelled"
  fi
fi

# Step 4: Run tests
log_step "Running tests..."
cd "$PROJECT_ROOT"
if ! npm test; then
  log_error "Tests failed!"
  if ! confirm "Deploy anyway?" "n"; then
    die "Deployment cancelled"
  fi
fi
log_success "Tests passed"

# Step 5: Build application
log_step "Building application..."
if ! npm run build; then
  die "Build failed"
fi
log_success "Build complete"

# Step 6: Show Terraform plan
log_step "Showing Terraform plan..."
plan_terraform "$ENVIRONMENT"

# Step 7: Confirm deployment
if ! confirm "Deploy to $ENVIRONMENT?" "n"; then
  die "Deployment cancelled"
fi

# Step 8: Apply Terraform
log_step "Applying Terraform..."
apply_terraform "$ENVIRONMENT" "true"

# Step 9: Get deployment info
DB_ENDPOINT=$(get_terraform_output "db_endpoint" "$ENVIRONMENT")
REDIS_ENDPOINT=$(get_terraform_output "redis_endpoint" "$ENVIRONMENT")
APP_URL=$(get_terraform_output "app_url" "$ENVIRONMENT" || echo "N/A")

log_info "Database: $DB_ENDPOINT"
log_info "Redis: $REDIS_ENDPOINT"
log_info "App URL: $APP_URL"

# Step 10: Run database migrations
log_step "Running database migrations..."
cd "$PROJECT_ROOT"
npm run db:migrate -- --env=$ENVIRONMENT
log_success "Migrations complete"

# Step 11: Run smoke tests
log_step "Running smoke tests..."
if command_exists curl && [ "$APP_URL" != "N/A" ]; then
  if curl -sf "$APP_URL/health" >/dev/null; then
    log_success "Health check passed"
  else
    log_warning "Health check failed"
  fi
fi

print_separator
log_success "Deployed to $ENVIRONMENT!"
print_separator

echo ""
log_info "Deployment summary:"
echo "  • Environment: $ENVIRONMENT"
echo "  • Branch: $BRANCH"
echo "  • Commit: $(get_git_commit)"
echo "  • Database: $DB_ENDPOINT"
echo "  • Redis: $REDIS_ENDPOINT"
echo "  • App URL: $APP_URL"
echo ""
log_info "Next steps:"
echo "  • Run 'make logs-staging' to view logs"
echo "  • Run 'make status-staging' to check status"
echo "  • Run 'make rollback-staging' if needed"
echo ""

