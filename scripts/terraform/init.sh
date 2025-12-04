#!/bin/bash
# scripts/terraform/init.sh
# Initialize Terraform with backend configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/terraform.sh"

ENVIRONMENT=${1:-local}

print_header "Initialize Terraform: $ENVIRONMENT"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(local|development|staging|production)$ ]]; then
  log_error "Invalid environment: $ENVIRONMENT"
  log_info "Valid options: local, development, staging, production"
  exit 1
fi

# Navigate to Terraform directory
cd "$PROJECT_ROOT/infrastructure/terraform"

# Check if backend configuration exists
if [ ! -f "backend-$ENVIRONMENT.tf" ] && [ ! -f "backend.tf" ]; then
  log_warning "No backend configuration found"
  log_info "Initializing with local backend..."
fi

log_step "Initializing Terraform for $ENVIRONMENT environment..."
echo ""

# Initialize based on environment
if [ "$ENVIRONMENT" = "local" ]; then
  log_info "Using LocalStack endpoints"
  log_info "Backend: local (no S3 backend for local dev)"
  echo ""
  
  # For local, we typically don't use S3 backend
  # Remove backend config temporarily if it exists
  if [ -f "backend.tf" ]; then
    log_warning "Backing up backend.tf (not used for local)"
    mv backend.tf backend.tf.backup 2>/dev/null || true
  fi
  
  # Initialize without backend
  terraform init \
    -var-file="environments/local.tfvars" \
    -upgrade
  
  # Restore backend.tf
  if [ -f "backend.tf.backup" ]; then
    mv backend.tf.backup backend.tf
  fi
else
  # For staging/production, use S3 backend
  log_info "Using AWS S3 backend"
  log_info "Environment: $ENVIRONMENT"
  echo ""
  
  # Check if .terraform directory exists
  if [ -d ".terraform" ]; then
    log_warning "Terraform already initialized"
    log_info "Use one of these options:"
    echo "  • terraform init -reconfigure     (reset backend config)"
    echo "  • terraform init -migrate-state   (migrate state to new backend)"
    echo "  • rm -rf .terraform && terraform init (clean init)"
    echo ""
    read -p "Continue with reconfigure? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      terraform init \
        -reconfigure \
        -var-file="environments/$ENVIRONMENT.tfvars" \
        -upgrade
    else
      log_info "Initialization cancelled"
      exit 0
    fi
  else
    # First time init
    terraform init \
      -var-file="environments/$ENVIRONMENT.tfvars" \
      -upgrade
  fi
fi

echo ""
log_success "Terraform initialized successfully!"
echo ""
log_info "Next steps:"
echo "  • Run 'make terraform-plan-$ENVIRONMENT' to see what will be created"
echo "  • Run 'make terraform-$ENVIRONMENT' to apply changes"
echo ""
