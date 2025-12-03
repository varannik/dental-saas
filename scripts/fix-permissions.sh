#!/bin/bash
# scripts/fix-permissions.sh
# Fix permissions for all shell scripts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔧 Fixing permissions for all shell scripts..."

# Find all .sh files and make them executable
find "$SCRIPT_DIR" -name "*.sh" -type f -exec chmod +x {} \;

echo "✓ All shell scripts are now executable"
echo ""
echo "Scripts with execute permissions:"
find "$SCRIPT_DIR" -name "*.sh" -type f -exec ls -lh {} \; | awk '{print "  " $9}'

