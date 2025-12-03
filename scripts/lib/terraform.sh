#!/bin/bash
# scripts/lib/terraform.sh
# Terraform-specific helper functions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

TERRAFORM_DIR="${PROJECT_ROOT}/infrastructure/terraform"

# Check if Terraform is installed
check_terraform() {
  if ! command_exists terraform; then
    log_error "Terraform is not installed"
    log_info "Install Terraform: https://www.terraform.io/downloads"
    return 1
  fi
  
  local version=$(terraform version -json | jq -r '.terraform_version')
  log_success "Terraform is installed (v$version)"
  return 0
}

# Check if Terraform is initialized
check_terraform_initialized() {
  if [ ! -d "$TERRAFORM_DIR/.terraform" ]; then
    log_warning "Terraform is not initialized"
    return 1
  fi
  
  log_success "Terraform is initialized"
  return 0
}

# Initialize Terraform
init_terraform() {
  log_info "Initializing Terraform..."
  cd "$TERRAFORM_DIR"
  terraform init
  cd - >/dev/null
  log_success "Terraform initialized"
}

# Ensure Terraform is initialized
ensure_terraform_initialized() {
  if check_terraform_initialized; then
    return 0
  fi
  
  init_terraform
}

# Check if Terraform state exists
terraform_state_exists() {
  local environment=$1
  
  cd "$TERRAFORM_DIR"
  
  # Check if state file exists (local backend)
  if [ -f "terraform.tfstate" ]; then
    cd - >/dev/null
    return 0
  fi
  
  # Check if remote state exists (S3 backend)
  if terraform state list >/dev/null 2>&1; then
    cd - >/dev/null
    return 0
  fi
  
  cd - >/dev/null
  return 1
}

# Get Terraform variable files for environment
get_var_files() {
  local environment=$1
  local var_files="-var-file=environments/${environment}.tfvars"
  
  # Add secrets file if it exists
  if [ -f "$TERRAFORM_DIR/environments/${environment}.secrets.tfvars" ]; then
    var_files="$var_files -var-file=environments/${environment}.secrets.tfvars"
  fi
  
  echo "$var_files"
}

# Apply Terraform for environment
apply_terraform() {
  local environment=$1
  local auto_approve=${2:-false}
  
  ensure_terraform_initialized
  
  cd "$TERRAFORM_DIR"
  
  local var_files=$(get_var_files "$environment")
  
  log_info "Applying Terraform for $environment..."
  
  if [ "$auto_approve" = "true" ]; then
    terraform apply $var_files -auto-approve
  else
    terraform apply $var_files
  fi
  
  cd - >/dev/null
  log_success "Terraform applied for $environment"
}

# Plan Terraform for environment
plan_terraform() {
  local environment=$1
  
  ensure_terraform_initialized
  
  cd "$TERRAFORM_DIR"
  
  local var_files=$(get_var_files "$environment")
  
  log_info "Planning Terraform for $environment..."
  terraform plan $var_files
  
  cd - >/dev/null
}

# Destroy Terraform for environment
destroy_terraform() {
  local environment=$1
  local auto_approve=${2:-false}
  
  ensure_terraform_initialized
  
  cd "$TERRAFORM_DIR"
  
  local var_files=$(get_var_files "$environment")
  
  log_warning "Destroying Terraform for $environment..."
  
  if [ "$auto_approve" = "true" ]; then
    terraform destroy $var_files -auto-approve
  else
    terraform destroy $var_files
  fi
  
  cd - >/dev/null
  log_success "Terraform destroyed for $environment"
}

# Get Terraform output
get_terraform_output() {
  local output_name=$1
  local environment=${2:-}
  
  cd "$TERRAFORM_DIR"
  
  if [ -n "$environment" ]; then
    # Switch to environment workspace if using workspaces
    terraform workspace select "$environment" 2>/dev/null || true
  fi
  
  local value=$(terraform output -raw "$output_name" 2>/dev/null)
  cd - >/dev/null
  
  echo "$value"
}

# Get all Terraform outputs as JSON
get_terraform_outputs_json() {
  local environment=${1:-}
  
  cd "$TERRAFORM_DIR"
  
  if [ -n "$environment" ]; then
    terraform workspace select "$environment" 2>/dev/null || true
  fi
  
  terraform output -json
  cd - >/dev/null
}

# Validate Terraform configuration
validate_terraform() {
  ensure_terraform_initialized
  
  cd "$TERRAFORM_DIR"
  log_info "Validating Terraform configuration..."
  terraform validate
  cd - >/dev/null
  log_success "Terraform configuration is valid"
}

# Format Terraform files
format_terraform() {
  cd "$TERRAFORM_DIR"
  log_info "Formatting Terraform files..."
  terraform fmt -recursive
  cd - >/dev/null
  log_success "Terraform files formatted"
}

# Show Terraform state
show_terraform_state() {
  local environment=${1:-}
  
  cd "$TERRAFORM_DIR"
  
  if [ -n "$environment" ]; then
    terraform workspace select "$environment" 2>/dev/null || true
  fi
  
  terraform state list
  cd - >/dev/null
}

# Refresh Terraform state
refresh_terraform_state() {
  local environment=$1
  
  ensure_terraform_initialized
  
  cd "$TERRAFORM_DIR"
  
  local var_files=$(get_var_files "$environment")
  
  log_info "Refreshing Terraform state for $environment..."
  terraform refresh $var_files
  cd - >/dev/null
  log_success "Terraform state refreshed"
}

