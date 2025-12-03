#!/bin/bash
# scripts/setup/check-dependencies.sh
# Check if all required dependencies are installed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"
source "$SCRIPT_DIR/../lib/terraform.sh"

print_header "Checking Dependencies"

# Track if all dependencies are met
all_deps_met=true

# Required dependencies
log_step "Checking required dependencies..."

# Docker
if check_docker; then
  if ! check_docker_running; then
    all_deps_met=false
  fi
else
  all_deps_met=false
fi

# Docker Compose
if ! check_docker_compose; then
  all_deps_met=false
fi

# Terraform
if ! check_terraform; then
  all_deps_met=false
fi

# Node.js
if ! command_exists node; then
  log_error "Node.js is not installed"
  log_info "Install Node.js: https://nodejs.org/"
  all_deps_met=false
else
  log_success "Node.js is installed ($(node --version))"
fi

# npm
if ! command_exists npm; then
  log_error "npm is not installed"
  all_deps_met=false
else
  log_success "npm is installed ($(npm --version))"
fi

# pnpm (required if using pnpm workspaces)
if [ -f "$PROJECT_ROOT/pnpm-workspace.yaml" ]; then
  log_step "Detected pnpm workspace configuration"
  if ! command_exists pnpm; then
    log_error "pnpm is REQUIRED but not installed"
    log_info "Your project uses pnpm workspaces (pnpm-workspace.yaml found)"
    echo ""
    log_info "Install pnpm with one of these methods:"
    echo "  • npm install -g pnpm"
    echo "  • curl -fsSL https://get.pnpm.io/install.sh | sh -"
    echo "  • brew install pnpm (macOS)"
    echo ""
    all_deps_met=false
  else
    log_success "pnpm is installed ($(pnpm --version))"
  fi
fi

# Optional but recommended dependencies
log_step "Checking optional dependencies..."

# jq (JSON processor)
if ! command_exists jq; then
  log_warning "jq is not installed (optional, but recommended)"
  log_info "Install: brew install jq (macOS) or apt-get install jq (Linux)"
else
  log_success "jq is installed ($(jq --version))"
fi

# AWS CLI (for staging/production)
if ! command_exists aws; then
  log_warning "AWS CLI is not installed (required for staging/production)"
  log_info "Install: https://aws.amazon.com/cli/"
else
  log_success "AWS CLI is installed ($(aws --version | cut -d' ' -f1))"
fi

# git
if ! command_exists git; then
  log_warning "git is not installed"
  all_deps_met=false
else
  log_success "git is installed ($(git --version | cut -d' ' -f3))"
fi

# curl
if ! command_exists curl; then
  log_warning "curl is not installed"
else
  log_success "curl is installed"
fi

# openssl
if ! command_exists openssl; then
  log_warning "openssl is not installed"
else
  log_success "openssl is installed"
fi

print_separator

if [ "$all_deps_met" = true ]; then
  log_success "All required dependencies are installed!"
  exit 0
else
  log_error "Some required dependencies are missing"
  echo ""
  log_info "To install missing dependencies:"
  echo "  • Docker: https://docs.docker.com/get-docker/"
  echo "  • Terraform: https://www.terraform.io/downloads"
  echo "  • Node.js: https://nodejs.org/"
  
  if [ -f "$PROJECT_ROOT/pnpm-workspace.yaml" ]; then
    echo "  • pnpm: curl -fsSL https://get.pnpm.io/install.sh | sh -"
  fi
  
  echo ""
  log_info "Or run: make install-tools"
  exit 1
fi

