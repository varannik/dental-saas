#!/bin/bash
# scripts/lib/common.sh
# Shared utility functions used across all scripts

set -e

# Colors for output
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[0;33m'
export BLUE='\033[0;34m'
export MAGENTA='\033[0;35m'
export CYAN='\033[0;36m'
export NC='\033[0m' # No Color

# Project root directory
export PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Logging functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

log_debug() {
  if [ "${DEBUG:-0}" = "1" ]; then
    echo -e "${MAGENTA}[DEBUG]${NC} $1"
  fi
}

log_step() {
  echo -e "${CYAN}▶${NC} $1"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check if file exists
file_exists() {
  [ -f "$1" ]
}

# Check if directory exists
dir_exists() {
  [ -d "$1" ]
}

# Wait for service to be ready
wait_for_service() {
  local service_name=$1
  local check_command=$2
  local max_attempts=${3:-30}
  local attempt=1

  log_info "Waiting for $service_name to be ready..."
  
  while [ $attempt -le $max_attempts ]; do
    if eval "$check_command" >/dev/null 2>&1; then
      log_success "$service_name is ready"
      return 0
    fi
    
    echo -n "."
    sleep 1
    attempt=$((attempt + 1))
  done
  
  echo ""
  log_error "$service_name failed to start after $max_attempts seconds"
  return 1
}

# Confirm action (for dangerous operations)
confirm() {
  local message=$1
  local default=${2:-n}
  
  if [ "$default" = "y" ]; then
    prompt="[Y/n]"
  else
    prompt="[y/N]"
  fi
  
  read -p "$(echo -e ${YELLOW}$message $prompt${NC}) " -n 1 -r
  echo
  
  if [ "$default" = "y" ]; then
    [[ $REPLY =~ ^[Nn]$ ]] && return 1 || return 0
  else
    [[ $REPLY =~ ^[Yy]$ ]] && return 0 || return 1
  fi
}

# Get current git branch
get_git_branch() {
  git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

# Get current git commit hash
get_git_commit() {
  git rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

# Check if running in CI environment
is_ci() {
  [ "${CI:-false}" = "true" ]
}

# Exit with error message
die() {
  log_error "$1"
  exit 1
}

# Check if running as root
is_root() {
  [ "$(id -u)" -eq 0 ]
}

# Get OS type
get_os() {
  case "$(uname -s)" in
    Darwin*)  echo "macos" ;;
    Linux*)   echo "linux" ;;
    MINGW*)   echo "windows" ;;
    *)        echo "unknown" ;;
  esac
}

# Create directory if it doesn't exist
ensure_dir() {
  local dir=$1
  if [ ! -d "$dir" ]; then
    log_debug "Creating directory: $dir"
    mkdir -p "$dir"
  fi
}

# Load environment variables from .env file
load_env() {
  local env_file=${1:-.env}
  if [ -f "$env_file" ]; then
    log_debug "Loading environment from $env_file"
    export $(grep -v '^#' "$env_file" | xargs)
  fi
}

# Check if port is in use
port_in_use() {
  local port=$1
  if command_exists lsof; then
    lsof -i ":$port" >/dev/null 2>&1
  elif command_exists netstat; then
    netstat -an | grep ":$port " | grep LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

# Generate random string
random_string() {
  local length=${1:-32}
  openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# URL encode string
urlencode() {
  local string="${1}"
  local strlen=${#string}
  local encoded=""
  local pos c o

  for (( pos=0 ; pos<strlen ; pos++ )); do
     c=${string:$pos:1}
     case "$c" in
        [-_.~a-zA-Z0-9] ) o="${c}" ;;
        * )               printf -v o '%%%02x' "'$c"
     esac
     encoded+="${o}"
  done
  echo "${encoded}"
}

# Print separator line
print_separator() {
  echo "────────────────────────────────────────────────────────────"
}

# Print header
print_header() {
  echo ""
  print_separator
  echo -e "${GREEN}$1${NC}"
  print_separator
  echo ""
}

