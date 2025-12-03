#!/bin/bash
# scripts/cleanup/clean.sh
# Clean build artifacts and node_modules

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

print_header "Cleaning Build Artifacts"

cd "$PROJECT_ROOT"

# Track what we're removing
total_size_before=$(du -sh . 2>/dev/null | cut -f1 || echo "Unknown")

log_step "Removing node_modules directories..."
node_modules_count=$(find . -name "node_modules" -type d -prune 2>/dev/null | wc -l | tr -d ' ')

if [ "$node_modules_count" -gt 0 ]; then
  find . -name "node_modules" -type d -prune -exec rm -rf {} +
  log_success "Removed $node_modules_count node_modules directories"
else
  log_info "No node_modules directories found"
fi

log_step "Removing build artifacts..."

# Next.js build directories
if find . -name ".next" -type d 2>/dev/null | grep -q ".next"; then
  find . -name ".next" -type d -prune -exec rm -rf {} +
  log_success "Removed .next directories"
fi

# Turbo cache
if [ -d ".turbo" ]; then
  rm -rf .turbo
  log_success "Removed .turbo cache"
fi

# Build output directories
if find . -name "dist" -type d 2>/dev/null | grep -q "dist"; then
  find . -name "dist" -type d -prune -exec rm -rf {} +
  log_success "Removed dist directories"
fi

if find . -name "build" -type d 2>/dev/null | grep -q "build"; then
  find . -name "build" -type d -prune -exec rm -rf {} +
  log_success "Removed build directories"
fi

# Coverage directories
if find . -name "coverage" -type d 2>/dev/null | grep -q "coverage"; then
  find . -name "coverage" -type d -prune -exec rm -rf {} +
  log_success "Removed coverage directories"
fi

# TypeScript build info
if find . -name "*.tsbuildinfo" 2>/dev/null | grep -q "tsbuildinfo"; then
  find . -name "*.tsbuildinfo" -delete
  log_success "Removed TypeScript build info files"
fi

log_step "Removing npm lock files..."

# Remove old npm/yarn lock files (keep pnpm-lock.yaml)
npm_locks=$(find . -name "package-lock.json" 2>/dev/null | wc -l | tr -d ' ')
if [ "$npm_locks" -gt 0 ]; then
  find . -name "package-lock.json" -delete
  log_success "Removed $npm_locks package-lock.json files"
fi

yarn_locks=$(find . -name "yarn.lock" 2>/dev/null | wc -l | tr -d ' ')
if [ "$yarn_locks" -gt 0 ]; then
  find . -name "yarn.lock" -delete
  log_success "Removed $yarn_locks yarn.lock files"
fi

log_step "Removing temporary files..."

# Remove temp files
if find . -name "*.log" -type f 2>/dev/null | grep -q "log"; then
  find . -name "*.log" -delete
  log_success "Removed log files"
fi

if find . -name ".DS_Store" 2>/dev/null | grep -q "DS_Store"; then
  find . -name ".DS_Store" -delete
  log_success "Removed .DS_Store files"
fi

# Remove pnpm store from project (not global)
if [ -d "node_modules/.pnpm" ]; then
  rm -rf node_modules/.pnpm
  log_success "Removed local pnpm store"
fi

total_size_after=$(du -sh . 2>/dev/null | cut -f1 || echo "Unknown")

print_separator
log_success "Cleanup complete!"
print_separator

echo ""
log_info "Summary:"
echo "  • Size before: $total_size_before"
echo "  • Size after:  $total_size_after"
echo ""
log_info "What was removed:"
echo "  • node_modules directories ($node_modules_count)"
echo "  • Build artifacts (.next, dist, build)"
echo "  • Coverage reports"
echo "  • npm/yarn lock files"
echo "  • Log files and temp files"
echo ""
log_info "Preserved:"
echo "  • pnpm-lock.yaml"
echo "  • Source code"
echo "  • Configuration files"
echo ""
log_info "Next steps:"
echo "  • Run 'make install' or 'pnpm install' to reinstall dependencies"
echo ""
