# Scripts Directory

This directory contains modular shell scripts for development, deployment, and maintenance of the Dental SaaS platform.

## 📁 Directory Structure

```
scripts/
├── lib/                      # Shared utility libraries
│   ├── common.sh            # Common utilities (logging, checks, etc.)
│   ├── docker.sh            # Docker operations
│   ├── terraform.sh         # Terraform operations
│   └── aws.sh               # AWS operations
│
├── setup/                    # Initial setup and installation
│   ├── check-dependencies.sh
│   ├── install-tools.sh
│   └── install-dependencies.sh
│
├── local/                    # Local development environment
│   ├── start.sh             # Start local environment
│   ├── stop.sh              # Stop local environment
│   ├── restart.sh           # Restart local environment
│   ├── reset.sh             # Reset local environment
│   └── status.sh            # Show local status
│
├── docker/                   # Docker operations
│   ├── start.sh
│   ├── stop.sh
│   ├── restart.sh
│   ├── logs.sh
│   ├── clean.sh
│   └── status.sh
│
├── terraform/                # Terraform operations
│   ├── init.sh
│   ├── apply.sh
│   ├── plan.sh
│   ├── destroy.sh
│   └── output.sh
│
├── database/                 # Database operations
│   ├── migrate.sh
│   ├── seed.sh
│   ├── reset.sh
│   ├── backup.sh
│   ├── restore.sh
│   └── console.sh
│
├── redis/                    # Redis operations
│   ├── console.sh
│   ├── flush.sh
│   └── info.sh
│
├── deploy/                   # Deployment scripts
│   ├── staging.sh
│   ├── production.sh
│   └── rollback.sh
│
├── dev/                      # Development server
│   ├── start.sh
│   └── start-services.sh
│
├── test/                     # Testing scripts
│   ├── run-all.sh
│   ├── run-unit.sh
│   ├── run-integration.sh
│   ├── run-e2e.sh
│   ├── run-coverage.sh
│   └── run-watch.sh
│
├── quality/                  # Code quality scripts
│   ├── lint.sh
│   ├── lint-fix.sh
│   ├── format.sh
│   ├── type-check.sh
│   └── check-all.sh
│
├── build/                    # Build scripts
│   ├── build-all.sh
│   ├── build-services.sh
│   └── build-docker.sh
│
├── secrets/                  # Secrets management
│   ├── generate.sh
│   ├── setup.sh
│   └── rotate.sh
│
├── monitoring/               # Monitoring and logs
│   ├── logs.sh
│   ├── status.sh
│   └── metrics.sh
│
├── ci/                       # CI/CD scripts
│   ├── test.sh
│   ├── build.sh
│   ├── deploy-staging.sh
│   └── deploy-production.sh
│
├── generate/                 # Code generation
│   ├── ddl.sh
│   ├── types.sh
│   └── api-docs.sh
│
├── cleanup/                  # Cleanup scripts
│   ├── clean.sh
│   └── clean-deps.sh
│
└── maintenance/              # Maintenance scripts
    ├── update-deps.sh
    ├── audit-security.sh
    └── analyze-bundle.sh
```

## 🎯 Design Principles

### 1. **Modularity**
- Each script has a single, well-defined purpose
- Shared functionality is extracted into `lib/` directory
- Scripts can be run independently or orchestrated via Makefile

### 2. **Reusability**
- Common functions in `lib/common.sh` (logging, checks, etc.)
- Service-specific functions in dedicated libraries (docker.sh, terraform.sh)
- All scripts source the appropriate libraries

### 3. **Consistency**
- All scripts follow the same structure
- Consistent error handling and logging
- Consistent naming conventions

### 4. **Safety**
- Confirmation prompts for destructive operations
- Environment checks before deployment
- Automatic rollback on failure (where possible)

### 5. **Conditional Logic**
- Check if resources exist before creating
- Skip steps if already completed
- Graceful handling of missing optional dependencies

## 🔧 Usage

### Via Makefile (Recommended)

```bash
# Start local environment
make local

# Deploy to staging
make deploy-staging

# Run tests
make test

# Show all available commands
make help
```

### Direct Script Execution

```bash
# Start local environment
./scripts/local/start.sh

# Deploy to staging
./scripts/deploy/staging.sh

# Run database migrations
./scripts/database/migrate.sh staging
```

## 📚 Library Functions

### common.sh

```bash
# Logging
log_info "message"      # Info message
log_success "message"   # Success message
log_warning "message"   # Warning message
log_error "message"     # Error message
log_debug "message"     # Debug message (only if DEBUG=1)

# Checks
command_exists "cmd"    # Check if command exists
file_exists "path"      # Check if file exists
dir_exists "path"       # Check if directory exists

# Utilities
confirm "message"       # Ask for user confirmation
wait_for_service "name" "check_cmd" # Wait for service to be ready
random_string 32        # Generate random string
get_git_branch          # Get current git branch
get_git_commit          # Get current git commit hash
```

### docker.sh

```bash
# Checks
check_docker            # Check if Docker is installed
check_docker_running    # Check if Docker is running
container_running "name" # Check if container is running
container_exists "name"  # Check if container exists

# Operations
start_containers        # Start all containers
stop_containers         # Stop all containers
restart_containers      # Restart all containers
clean_containers        # Remove containers and volumes

# Waiting
wait_for_postgres       # Wait for PostgreSQL
wait_for_redis          # Wait for Redis
wait_for_minio          # Wait for MinIO
```

### terraform.sh

```bash
# Checks
check_terraform         # Check if Terraform is installed
check_terraform_initialized # Check if Terraform is initialized
terraform_state_exists "env" # Check if state exists

# Operations
init_terraform          # Initialize Terraform
apply_terraform "env" "auto_approve" # Apply Terraform
plan_terraform "env"    # Show Terraform plan
destroy_terraform "env" # Destroy Terraform resources

# Outputs
get_terraform_output "name" "env" # Get single output
get_terraform_outputs_json "env"  # Get all outputs as JSON
```

## 🔐 Environment Variables

Scripts respect the following environment variables:

```bash
# Debug mode
DEBUG=1                 # Enable debug logging

# CI mode
CI=true                 # Running in CI environment

# AWS
AWS_PROFILE=default     # AWS profile to use
AWS_REGION=us-east-1    # AWS region

# Database
DB_HOST=localhost       # Database host
DB_PORT=5432            # Database port
DB_NAME=dental_saas     # Database name
DB_USER=postgres        # Database user
DB_PASSWORD=postgres    # Database password

# Redis
REDIS_HOST=localhost    # Redis host
REDIS_PORT=6379         # Redis port
```

## 🚀 Adding New Scripts

### Template

```bash
#!/bin/bash
# scripts/category/script-name.sh
# Brief description of what this script does

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/docker.sh"  # If needed
source "$SCRIPT_DIR/../lib/terraform.sh"  # If needed

print_header "Script Name"

# Step 1: Description
log_step "Doing something..."
# ... implementation ...
log_success "Done"

# Step 2: Description
log_step "Doing something else..."
# ... implementation ...
log_success "Done"

print_separator
log_success "Script completed successfully!"
print_separator
```

### Best Practices

1. **Always use `set -e`** - Exit on error
2. **Source required libraries** - Use shared functions
3. **Use logging functions** - Consistent output
4. **Add comments** - Explain what each step does
5. **Check prerequisites** - Verify dependencies before running
6. **Confirm destructive operations** - Ask for user confirmation
7. **Provide helpful output** - Show next steps at the end
8. **Handle errors gracefully** - Provide clear error messages

## 🧪 Testing Scripts

```bash
# Test individual script
./scripts/local/start.sh

# Test with debug output
DEBUG=1 ./scripts/local/start.sh

# Test in dry-run mode (if supported)
DRY_RUN=1 ./scripts/deploy/staging.sh
```

## 📝 Documentation

Each script should:
- Have a clear description at the top
- Document required environment variables
- Document expected arguments
- Provide examples in comments

## 🔄 Maintenance

### Updating Dependencies

```bash
# Update all npm dependencies
make update-deps

# Audit security vulnerabilities
make audit-security
```

### Cleaning Up

```bash
# Clean build artifacts
make clean

# Clean node_modules
make clean-deps

# Clean Docker resources
make docker-clean
```

## 🆘 Troubleshooting

### Script fails with "command not found"

```bash
# Make script executable
chmod +x scripts/path/to/script.sh
```

### Script fails with "No such file or directory"

```bash
# Check if sourcing correct libraries
source "$SCRIPT_DIR/../lib/common.sh"
```

### Docker commands fail

```bash
# Check if Docker is running
make check-deps

# Restart Docker
# macOS: Restart Docker Desktop
# Linux: sudo systemctl restart docker
```

### Terraform commands fail

```bash
# Initialize Terraform
make terraform-init

# Check Terraform state
cd infrastructure/terraform && terraform state list
```

## 📞 Support

For issues or questions:
1. Check this README
2. Run `make help` to see available commands
3. Check individual script comments
4. Review logs with `make logs`

## 🔗 Related Documentation

- [Makefile](../Makefile) - Command orchestration
- [Infrastructure README](../infrastructure/README.md) - Infrastructure setup
- [Architecture Docs](../docs/architecture/) - System architecture

