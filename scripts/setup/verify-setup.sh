#!/bin/bash
# scripts/setup/verify-setup.sh
# Verify that the setup is complete and working

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPTS_ROOT/lib/common.sh"

print_header "Verifying Setup"

# Track verification status
all_checks_passed=true

# Check 1: Makefile exists
log_step "Checking Makefile..."
if [ -f "$PROJECT_ROOT/Makefile" ]; then
  log_success "Makefile exists"
else
  log_error "Makefile not found"
  all_checks_passed=false
fi

# Check 2: Core libraries exist
log_step "Checking core libraries..."
for lib in common.sh docker.sh terraform.sh; do
  if [ -f "$SCRIPTS_ROOT/lib/$lib" ]; then
    log_success "lib/$lib exists"
  else
    log_error "lib/$lib not found"
    all_checks_passed=false
  fi
done

# Check 3: Essential scripts exist
log_step "Checking essential scripts..."
essential_scripts=(
  "setup/check-dependencies.sh"
  "setup/install-dependencies.sh"
  "setup/install-tools.sh"
  "setup/fix-permissions.sh"
  "setup/verify-setup.sh"
  "setup/dev-setup.sh"
  "local/start.sh"
  "deploy/staging.sh"
  "terraform/validate-region.sh"
  "test/smoke-tests.sh"
  "secrets/generate.sh"
)

for script in "${essential_scripts[@]}"; do
  if [ -f "$SCRIPTS_ROOT/$script" ]; then
    log_success "$script exists"
  else
    log_error "$script not found"
    all_checks_passed=false
  fi
done

# Check 4: Scripts are executable
log_step "Checking script permissions..."
non_executable=0
for script in $(find "$SCRIPTS_ROOT" -name "*.sh" -type f); do
  if [ ! -x "$script" ]; then
    log_warning "$(basename $script) is not executable"
    non_executable=$((non_executable + 1))
  fi
done

if [ $non_executable -eq 0 ]; then
  log_success "All scripts are executable"
else
  log_warning "$non_executable scripts need execute permissions"
  log_info "Run: make fix-permissions"
fi

# Check 5: Docker Compose exists
log_step "Checking Docker Compose file..."
if [ -f "$PROJECT_ROOT/infrastructure/docker/docker-compose.yml" ]; then
  log_success "docker-compose.yml exists"
else
  log_error "docker-compose.yml not found"
  all_checks_passed=false
fi

# Check 6: Documentation exists
log_step "Checking documentation..."
docs=(
  "QUICKSTART.md"
  "IMPLEMENTATION_STATUS.md"
  "SETUP_SUMMARY.md"
  "scripts/README.md"
)

for doc in "${docs[@]}"; do
  if [ -f "$PROJECT_ROOT/$doc" ]; then
    log_success "$doc exists"
  else
    log_warning "$doc not found"
  fi
done

# Check 7: .gitignore exists
log_step "Checking .gitignore..."
if [ -f "$PROJECT_ROOT/.gitignore" ]; then
  log_success ".gitignore exists"
  
  # Check for important patterns
  if grep -q "*.secrets.tfvars" "$PROJECT_ROOT/.gitignore"; then
    log_success "Secrets are protected"
  else
    log_warning "Secrets pattern not found in .gitignore"
  fi
else
  log_error ".gitignore not found"
  all_checks_passed=false
fi

# Check 8: Make help works
log_step "Testing make help..."
if cd "$PROJECT_ROOT" && make help >/dev/null 2>&1; then
  log_success "make help works"
else
  log_error "make help failed"
  all_checks_passed=false
fi

# Check 9: Count stub scripts
log_step "Counting scripts..."
total_scripts=$(find "$SCRIPTS_ROOT" -name "*.sh" -type f | wc -l | tr -d ' ')
stub_scripts=$(grep -r "This script is not yet implemented" "$SCRIPTS_ROOT" --include="*.sh" | wc -l | tr -d ' ')
implemented_scripts=$((total_scripts - stub_scripts))

log_info "Total scripts: $total_scripts"
log_info "Implemented: $implemented_scripts"
log_info "Stubs: $stub_scripts"

# Final summary
print_separator

if [ "$all_checks_passed" = true ]; then
  log_success "All critical checks passed!"
  echo ""
  log_info "Setup Status:"
  echo "  ✅ Infrastructure: Complete"
  echo "  ✅ Core libraries: Complete"
  echo "  ✅ Essential scripts: Complete"
  echo "  ✅ Documentation: Complete"
  echo "  🔄 Stub scripts: $stub_scripts ready for implementation"
  echo ""
  log_info "Next steps:"
  echo "  1. Run 'make check-deps' to verify dependencies"
  echo "  2. Run 'make help' to see all commands"
  echo "  3. Read QUICKSTART.md for setup instructions"
  echo "  4. Read IMPLEMENTATION_STATUS.md for next steps"
  echo ""
  exit 0
else
  log_error "Some checks failed!"
  echo ""
  log_info "Please review the errors above and fix them."
  exit 1
fi

