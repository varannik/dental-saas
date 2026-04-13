#!/bin/bash
# scripts/lib/aws.sh
# AWS-specific helper functions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Check if AWS CLI is installed
check_aws_cli() {
  if ! command_exists aws; then
    log_error "AWS CLI is not installed"
    log_info "Install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    return 1
  fi

  log_success "AWS CLI is installed ($(aws --version | cut -d' ' -f1))"
  return 0
}

# Resolve AWS region with project default fallback
get_aws_region() {
  echo "${AWS_REGION:-eu-central-1}"
}

# Check that AWS credentials are available
check_aws_credentials() {
  local region
  region="$(get_aws_region)"

  if ! aws sts get-caller-identity --region "$region" >/dev/null 2>&1; then
    log_error "AWS credentials are not configured or are invalid"
    log_info "Run: aws configure"
    log_info "Or export AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
    return 1
  fi

  log_success "AWS credentials are valid"
  return 0
}

# Validate that AWS tooling is ready for cloud environments
require_aws_for_env() {
  local environment=$1

  if [[ "$environment" =~ ^(staging|production)$ ]]; then
    check_aws_cli || return 1
    check_aws_credentials || return 1
  fi

  return 0
}

# Wrapper to run AWS command in resolved region
run_aws() {
  local region
  region="$(get_aws_region)"
  aws --region "$region" "$@"
}
