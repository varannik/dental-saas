#!/bin/bash
# scripts/setup/fix-permissions.sh
# Fix permissions for all shell scripts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔧 Fixing permissions for all shell scripts..."

# Find all .sh files in scripts/ and make them executable
find "$SCRIPTS_ROOT" -name "*.sh" -type f -exec chmod +x {} \;

echo "✓ All shell scripts are now executable"
echo ""
echo "Scripts with execute permissions:"
find "$SCRIPTS_ROOT" -name "*.sh" -type f -exec ls -lh {} \; | awk '{print "  " $9}'

