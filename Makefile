# Makefile
# Dental SaaS Platform - Development & Deployment Orchestration
# This Makefile orchestrates shell scripts for modularity and maintainability

.PHONY: help
.DEFAULT_GOAL := help

# Project Configuration
PROJECT_NAME := dental-saas
SCRIPTS_DIR := scripts

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m

##@ Help

help: ## Display this help message
	@echo "$(BLUE)╔════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║  $(GREEN)Dental SaaS Platform$(BLUE) - Development Commands         ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "$(YELLOW)Usage:$(NC)\n  make $(BLUE)<target>$(NC)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(BLUE)%-25s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(GREEN)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""

##@ Setup & Installation

check-deps: ## Check if all required dependencies are installed
	@$(SCRIPTS_DIR)/setup/check-dependencies.sh

install-tools: ## Install missing development tools
	@$(SCRIPTS_DIR)/setup/install-tools.sh

setup: ## Complete initial project setup (first-time setup)
	@echo "$(GREEN)Setting up Dental SaaS Platform...$(NC)"
	@$(MAKE) check-deps
	@$(MAKE) install
	@$(MAKE) local
	@echo "$(GREEN)✓ Setup complete! Run 'make dev' to start developing$(NC)"

install: ## Install all project dependencies (requires pnpm for workspace projects)
	@$(SCRIPTS_DIR)/setup/install-dependencies.sh

##@ Local Development

local: ## Start complete local development environment (Docker + Terraform)
	@$(SCRIPTS_DIR)/local/start.sh

local-stop: ## Stop local development environment
	@$(SCRIPTS_DIR)/local/stop.sh

local-restart: ## Restart local development environment
	@$(MAKE) local-stop
	@$(MAKE) local

local-reset: ## Reset local environment (clean slate)
	@$(SCRIPTS_DIR)/local/reset.sh

local-status: ## Show status of local services
	@$(SCRIPTS_DIR)/local/status.sh

##@ Docker Operations

docker-up: ## Start Docker containers (PostgreSQL, Redis, MinIO)
	@$(SCRIPTS_DIR)/docker/start.sh

docker-down: ## Stop Docker containers
	@$(SCRIPTS_DIR)/docker/stop.sh

docker-restart: ## Restart Docker containers
	@$(SCRIPTS_DIR)/docker/restart.sh

docker-logs: ## Show Docker container logs (tail -f)
	@$(SCRIPTS_DIR)/docker/logs.sh

docker-clean: ## Remove Docker containers and volumes (DESTRUCTIVE)
	@$(SCRIPTS_DIR)/docker/clean.sh

docker-ps: ## Show running Docker containers
	@$(SCRIPTS_DIR)/docker/status.sh

##@ Terraform Operations

terraform-init: ## Initialize Terraform
	@$(SCRIPTS_DIR)/terraform/init.sh

terraform-local: ## Apply Terraform for local environment
	@$(SCRIPTS_DIR)/terraform/apply.sh local

terraform-staging: ## Apply Terraform for staging environment
	@$(SCRIPTS_DIR)/terraform/apply.sh staging

terraform-production: ## Apply Terraform for production environment
	@$(SCRIPTS_DIR)/terraform/apply.sh production

terraform-plan-staging: ## Show Terraform plan for staging
	@$(SCRIPTS_DIR)/terraform/plan.sh staging

terraform-plan-production: ## Show Terraform plan for production
	@$(SCRIPTS_DIR)/terraform/plan.sh production

terraform-destroy-staging: ## Destroy staging infrastructure (DESTRUCTIVE)
	@$(SCRIPTS_DIR)/terraform/destroy.sh staging

terraform-destroy-production: ## Destroy production infrastructure (DESTRUCTIVE)
	@$(SCRIPTS_DIR)/terraform/destroy.sh production

terraform-output: ## Show Terraform outputs
	@$(SCRIPTS_DIR)/terraform/output.sh

##@ Database Operations

db-migrate: ## Run database migrations (local)
	@$(SCRIPTS_DIR)/database/migrate.sh local

db-migrate-staging: ## Run database migrations (staging)
	@$(SCRIPTS_DIR)/database/migrate.sh staging

db-migrate-production: ## Run database migrations (production)
	@$(SCRIPTS_DIR)/database/migrate.sh production

db-seed: ## Seed database with test data (local)
	@$(SCRIPTS_DIR)/database/seed.sh local

db-seed-staging: ## Seed database with test data (staging)
	@$(SCRIPTS_DIR)/database/seed.sh staging

db-reset: ## Reset database (drop, migrate, seed) - LOCAL ONLY
	@$(SCRIPTS_DIR)/database/reset.sh

db-backup: ## Backup database (requires ENV=staging|production)
	@$(SCRIPTS_DIR)/database/backup.sh $(ENV)

db-restore: ## Restore database from backup (requires ENV and BACKUP_FILE)
	@$(SCRIPTS_DIR)/database/restore.sh $(ENV) $(BACKUP_FILE)

db-console: ## Open PostgreSQL console (local)
	@$(SCRIPTS_DIR)/database/console.sh local

db-console-staging: ## Open PostgreSQL console (staging)
	@$(SCRIPTS_DIR)/database/console.sh staging

##@ Redis Operations

redis-console: ## Open Redis CLI (local)
	@$(SCRIPTS_DIR)/redis/console.sh local

redis-console-staging: ## Open Redis CLI (staging)
	@$(SCRIPTS_DIR)/redis/console.sh staging

redis-flush: ## Flush Redis database (local only)
	@$(SCRIPTS_DIR)/redis/flush.sh local

redis-info: ## Show Redis info and stats
	@$(SCRIPTS_DIR)/redis/info.sh local

##@ Development Server

dev: ## Start development server (Next.js + services)
	@$(SCRIPTS_DIR)/dev/start.sh

dev-web: ## Start web app only
	@cd apps/web && npm run dev

dev-admin: ## Start admin app only
	@cd apps/admin && npm run dev

dev-mobile: ## Start mobile app (Expo)
	@cd apps/mobile && npm start

dev-services: ## Start all microservices
	@$(SCRIPTS_DIR)/dev/start-services.sh

##@ Code Quality

lint: ## Run linter on all packages
	@$(SCRIPTS_DIR)/quality/lint.sh

lint-fix: ## Fix linting issues automatically
	@$(SCRIPTS_DIR)/quality/lint-fix.sh

format: ## Format code with Prettier
	@$(SCRIPTS_DIR)/quality/format.sh

type-check: ## Run TypeScript type checking
	@$(SCRIPTS_DIR)/quality/type-check.sh

check: ## Run all quality checks (lint + type-check + test)
	@$(SCRIPTS_DIR)/quality/check-all.sh

##@ Testing

test: ## Run all tests
	@$(SCRIPTS_DIR)/test/run-all.sh

test-unit: ## Run unit tests
	@$(SCRIPTS_DIR)/test/run-unit.sh

test-integration: ## Run integration tests
	@$(SCRIPTS_DIR)/test/run-integration.sh

test-e2e: ## Run end-to-end tests
	@$(SCRIPTS_DIR)/test/run-e2e.sh

test-coverage: ## Run tests with coverage report
	@$(SCRIPTS_DIR)/test/run-coverage.sh

test-watch: ## Run tests in watch mode
	@$(SCRIPTS_DIR)/test/run-watch.sh

##@ Build & Package

build: ## Build all packages and apps
	@$(SCRIPTS_DIR)/build/build-all.sh

build-web: ## Build web app
	@cd apps/web && npm run build

build-admin: ## Build admin app
	@cd apps/admin && npm run build

build-services: ## Build all microservices
	@$(SCRIPTS_DIR)/build/build-services.sh

build-docker: ## Build Docker images for all services
	@$(SCRIPTS_DIR)/build/build-docker.sh

clean: ## Clean build artifacts and node_modules
	@$(SCRIPTS_DIR)/cleanup/clean.sh

clean-deps: ## Clean node_modules only
	@$(SCRIPTS_DIR)/cleanup/clean-deps.sh

##@ Deployment

deploy-staging: ## Deploy to staging environment
	@$(SCRIPTS_DIR)/deploy/staging.sh

deploy-production: ## Deploy to production environment
	@$(SCRIPTS_DIR)/deploy/production.sh

rollback-staging: ## Rollback staging to previous version
	@$(SCRIPTS_DIR)/deploy/rollback.sh staging

rollback-production: ## Rollback production to previous version
	@$(SCRIPTS_DIR)/deploy/rollback.sh production

##@ Secrets Management

secrets-generate: ## Generate random secrets for .secrets.tfvars
	@$(SCRIPTS_DIR)/secrets/generate.sh

secrets-setup-staging: ## Setup secrets in AWS Secrets Manager (staging)
	@$(SCRIPTS_DIR)/secrets/setup.sh staging

secrets-setup-production: ## Setup secrets in AWS Secrets Manager (production)
	@$(SCRIPTS_DIR)/secrets/setup.sh production

secrets-rotate-staging: ## Rotate secrets (staging)
	@$(SCRIPTS_DIR)/secrets/rotate.sh staging

secrets-rotate-production: ## Rotate secrets (production)
	@$(SCRIPTS_DIR)/secrets/rotate.sh production

##@ Monitoring & Logs

logs-staging: ## Tail staging logs (CloudWatch)
	@$(SCRIPTS_DIR)/monitoring/logs.sh staging

logs-production: ## Tail production logs (CloudWatch)
	@$(SCRIPTS_DIR)/monitoring/logs.sh production

logs-local: ## Show local Docker logs
	@$(MAKE) docker-logs

status-staging: ## Check staging infrastructure status
	@$(SCRIPTS_DIR)/monitoring/status.sh staging

status-production: ## Check production infrastructure status
	@$(SCRIPTS_DIR)/monitoring/status.sh production

metrics-staging: ## Show staging metrics
	@$(SCRIPTS_DIR)/monitoring/metrics.sh staging

metrics-production: ## Show production metrics
	@$(SCRIPTS_DIR)/monitoring/metrics.sh production

##@ CI/CD (GitHub Actions)

ci-test: ## Run CI test suite
	@$(SCRIPTS_DIR)/ci/test.sh

ci-build: ## Build for CI
	@$(SCRIPTS_DIR)/ci/build.sh

ci-deploy-staging: ## CI deploy to staging
	@$(SCRIPTS_DIR)/ci/deploy-staging.sh

ci-deploy-production: ## CI deploy to production
	@$(SCRIPTS_DIR)/ci/deploy-production.sh

##@ Utilities

fix-permissions: ## Fix permissions for all shell scripts
	@$(SCRIPTS_DIR)/setup/fix-permissions.sh

shell-postgres: ## Shell into PostgreSQL container
	@docker exec -it $$(docker ps -qf "name=postgres") /bin/sh

shell-redis: ## Shell into Redis container
	@docker exec -it $$(docker ps -qf "name=redis") /bin/sh

shell-minio: ## Shell into MinIO container
	@docker exec -it $$(docker ps -qf "name=minio") /bin/sh

generate-ddl: ## Generate SQL DDL from schema YAML
	@$(SCRIPTS_DIR)/generate/ddl.sh

generate-types: ## Generate TypeScript types from schema
	@$(SCRIPTS_DIR)/generate/types.sh

generate-api-docs: ## Generate API documentation
	@$(SCRIPTS_DIR)/generate/api-docs.sh

##@ Maintenance

update-deps: ## Update all dependencies to latest versions
	@$(SCRIPTS_DIR)/maintenance/update-deps.sh

audit-security: ## Run security audit on dependencies
	@$(SCRIPTS_DIR)/maintenance/audit-security.sh

analyze-bundle: ## Analyze bundle size
	@$(SCRIPTS_DIR)/maintenance/analyze-bundle.sh

##@ Quick Commands (Shortcuts)

start: local dev ## Quick start: local environment + dev server

stop: local-stop ## Quick stop: stop everything

restart: local-restart dev ## Quick restart: restart everything

reset: local-reset ## Quick reset: clean slate

ps: docker-ps ## Quick ps: show running containers

logs: docker-logs ## Quick logs: show Docker logs
