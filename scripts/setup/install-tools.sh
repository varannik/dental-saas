#!/bin/bash
# scripts/setup/install-tools.sh
# Install missing development tools

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

print_header "Installing Development Tools"

OS=$(get_os)
log_info "Detected OS: $OS"

# Install based on OS
case "$OS" in
  macos)
    log_step "Installing tools for macOS..."
    
    # Check if Homebrew is installed
    if ! command_exists brew; then
      log_info "Installing Homebrew..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install tools
    if ! command_exists docker; then
      log_info "Please install Docker Desktop manually: https://www.docker.com/products/docker-desktop"
    fi
    
    if ! command_exists terraform; then
      log_info "Installing Terraform..."
      brew tap hashicorp/tap
      brew install hashicorp/tap/terraform
    fi
    
    if ! command_exists node; then
      log_info "Installing Node.js..."
      brew install node@20
    fi
    
    if ! command_exists pnpm; then
      log_info "Installing pnpm..."
      brew install pnpm
    fi
    
    if ! command_exists jq; then
      log_info "Installing jq..."
      brew install jq
    fi
    
    if ! command_exists aws; then
      log_info "Installing AWS CLI..."
      brew install awscli
    fi
    ;;
    
  linux)
    log_step "Installing tools for Linux..."
    
    if ! command_exists docker; then
      log_info "Installing Docker..."
      curl -fsSL https://get.docker.com -o get-docker.sh
      sudo sh get-docker.sh
      rm get-docker.sh
    fi
    
    if ! command_exists terraform; then
      log_info "Installing Terraform..."
      wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
      echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
      sudo apt update && sudo apt install terraform
    fi
    
    if ! command_exists node; then
      log_info "Installing Node.js..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
    fi
    
    if ! command_exists pnpm; then
      log_info "Installing pnpm..."
      curl -fsSL https://get.pnpm.io/install.sh | sh -
      export PNPM_HOME="$HOME/.local/share/pnpm"
      export PATH="$PNPM_HOME:$PATH"
    fi
    
    if ! command_exists jq; then
      log_info "Installing jq..."
      sudo apt-get install -y jq
    fi
    ;;
    
  *)
    log_error "Unsupported OS: $OS"
    log_info "Please install tools manually:"
    echo "  • Docker: https://docs.docker.com/get-docker/"
    echo "  • Terraform: https://www.terraform.io/downloads"
    echo "  • Node.js: https://nodejs.org/"
    exit 1
    ;;
esac

log_success "Tools installation complete!"

# Run dependency check
log_step "Verifying installation..."
"$SCRIPT_DIR/check-dependencies.sh"

