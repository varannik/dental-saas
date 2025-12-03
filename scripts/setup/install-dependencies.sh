#!/bin/bash
# scripts/setup/install-dependencies.sh
# Install all project dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

print_header "Installing Dependencies"

cd "$PROJECT_ROOT"

# Check if using pnpm workspaces
if [ -f "pnpm-workspace.yaml" ]; then
  log_step "Detected pnpm workspace configuration"
  
  # Check if pnpm is installed
  if ! command_exists pnpm; then
    log_error "pnpm is required but not installed"
    echo ""
    log_info "Install pnpm with one of these methods:"
    echo "  • npm install -g pnpm"
    echo "  • brew install pnpm (macOS)"
    echo "  • curl -fsSL https://get.pnpm.io/install.sh | sh -"
    echo ""
    die "Please install pnpm and try again"
  fi
  
  log_info "Using pnpm to install all workspace dependencies..."
  log_info "This will install dependencies for all apps, services, and packages"
  echo ""
  
  # Install all dependencies with pnpm
  pnpm install
  
  log_success "All workspace dependencies installed!"
  
# Check if using npm workspaces
elif grep -q '"workspaces"' package.json 2>/dev/null; then
  log_step "Detected npm workspace configuration"
  log_info "Using npm to install all workspace dependencies..."
  echo ""
  
  npm install
  
  log_success "All workspace dependencies installed!"
  
# Standard npm project (no workspaces)
else
  log_step "Installing dependencies (standard npm project)..."
  
  # Install root dependencies
  if [ -f "package.json" ]; then
    npm install
    log_success "Root dependencies installed"
  fi
  
  # Install dependencies for each app
  if [ -d "apps" ]; then
    log_step "Installing app dependencies..."
    for app in apps/*; do
      if [ -d "$app" ] && [ -f "$app/package.json" ]; then
        app_name=$(basename "$app")
        log_info "Installing $app_name dependencies..."
        (cd "$app" && npm install)
      fi
    done
    log_success "App dependencies installed"
  fi
  
  # Install dependencies for each service
  if [ -d "services" ]; then
    log_step "Installing service dependencies..."
    for service in services/*; do
      if [ -d "$service" ] && [ -f "$service/package.json" ]; then
        service_name=$(basename "$service")
        log_info "Installing $service_name dependencies..."
        (cd "$service" && npm install)
      fi
    done
    log_success "Service dependencies installed"
  fi
  
  # Install dependencies for each package
  if [ -d "packages" ]; then
    log_step "Installing package dependencies..."
    for package in packages/*; do
      if [ -d "$package" ] && [ -f "$package/package.json" ]; then
        package_name=$(basename "$package")
        log_info "Installing $package_name dependencies..."
        (cd "$package" && npm install)
      fi
    done
    log_success "Package dependencies installed"
  fi
fi

cd "$PROJECT_ROOT"

print_separator
log_success "All dependencies installed!"
print_separator

echo ""
log_info "Next steps:"
echo "  • Run 'make local' to start local environment"
echo "  • Run 'make dev' to start development server"
echo ""

