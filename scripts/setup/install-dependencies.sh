#!/bin/bash
# scripts/setup/install-dependencies.sh
# Install all project dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

print_header "Installing Dependencies"

# Install root dependencies
log_step "Installing root dependencies..."
cd "$PROJECT_ROOT"
npm install
log_success "Root dependencies installed"

# Install workspace dependencies (if using workspaces)
if [ -f "pnpm-workspace.yaml" ]; then
  log_step "Installing workspace dependencies with pnpm..."
  if command_exists pnpm; then
    pnpm install
  else
    log_warning "pnpm not found, using npm workspaces"
    npm install
  fi
  log_success "Workspace dependencies installed"
fi

# Install dependencies for each app
log_step "Installing app dependencies..."

if [ -d "apps/web" ]; then
  log_info "Installing web app dependencies..."
  cd "$PROJECT_ROOT/apps/web"
  npm install
fi

if [ -d "apps/admin" ]; then
  log_info "Installing admin app dependencies..."
  cd "$PROJECT_ROOT/apps/admin"
  npm install
fi

if [ -d "apps/mobile" ]; then
  log_info "Installing mobile app dependencies..."
  cd "$PROJECT_ROOT/apps/mobile"
  npm install
fi

log_success "App dependencies installed"

# Install dependencies for each service
log_step "Installing service dependencies..."

for service in "$PROJECT_ROOT/services"/*; do
  if [ -d "$service" ] && [ -f "$service/package.json" ]; then
    service_name=$(basename "$service")
    log_info "Installing $service_name dependencies..."
    cd "$service"
    npm install
  fi
done

log_success "Service dependencies installed"

# Install dependencies for each package
log_step "Installing package dependencies..."

for package in "$PROJECT_ROOT/packages"/*; do
  if [ -d "$package" ] && [ -f "$package/package.json" ]; then
    package_name=$(basename "$package")
    log_info "Installing $package_name dependencies..."
    cd "$package"
    npm install
  fi
done

log_success "Package dependencies installed"

cd "$PROJECT_ROOT"

print_separator
log_success "All dependencies installed!"
print_separator

echo ""
log_info "Next steps:"
echo "  • Run 'make local' to start local environment"
echo "  • Run 'make dev' to start development server"
echo ""

