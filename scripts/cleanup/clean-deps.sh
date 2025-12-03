#!/bin/bash
# scripts/cleanup/clean-deps.sh
# Clean node_modules only (faster cleanup)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

print_header "Cleaning Dependencies"

cd "$PROJECT_ROOT"

log_step "Scanning for node_modules directories..."

node_modules_count=$(find . -name "node_modules" -type d -prune 2>/dev/null | wc -l | tr -d ' ')

if [ "$node_modules_count" -eq 0 ]; then
  log_info "No node_modules directories found"
  print_separator
  log_success "Nothing to clean!"
  exit 0
fi

log_info "Found $node_modules_count node_modules directories"
echo ""

# Calculate size before
log_step "Calculating size..."
total_size=$(du -shc $(find . -name "node_modules" -type d -prune 2>/dev/null) 2>/dev/null | tail -1 | cut -f1 || echo "Unknown")
log_info "Total size: $total_size"
echo ""

# Confirm if in interactive mode
if [ -t 0 ]; then
  log_warning "This will remove all node_modules directories"
  if ! confirm "Continue?"; then
    log_info "Cleanup cancelled"
    exit 0
  fi
fi

log_step "Removing node_modules directories..."

find . -name "node_modules" -type d -prune -exec rm -rf {} +

log_success "Removed $node_modules_count node_modules directories ($total_size freed)"

print_separator
log_success "Dependencies cleaned!"
print_separator

echo ""
log_info "Next steps:"
echo "  • Run 'make install' or 'pnpm install' to reinstall dependencies"
echo ""
