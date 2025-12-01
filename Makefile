# Makefile for common development tasks

.PHONY: help install dev build test lint clean docker-up docker-down

# Default target
help:
	@echo "Available commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Start development servers"
	@echo "  make build        - Build all packages"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linter"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make docker-up    - Start Docker services"
	@echo "  make docker-down  - Stop Docker services"
	@echo "  make setup        - Full development setup"

# Install dependencies
install:
	pnpm install

# Start development
dev:
	pnpm dev

# Build all packages
build:
	pnpm build

# Run tests
test:
	pnpm test

# Run unit tests
test-unit:
	pnpm test:unit

# Run integration tests
test-integration:
	pnpm test:integration

# Run E2E tests
test-e2e:
	pnpm test:e2e

# Lint code
lint:
	pnpm lint

# Fix linting issues
lint-fix:
	pnpm lint:fix

# Format code
format:
	pnpm format

# Clean build artifacts
clean:
	pnpm clean
	rm -rf node_modules

# Start Docker services
docker-up:
	docker-compose -f infrastructure/docker/docker-compose.yml up -d

# Stop Docker services
docker-down:
	docker-compose -f infrastructure/docker/docker-compose.yml down

# View Docker logs
docker-logs:
	docker-compose -f infrastructure/docker/docker-compose.yml logs -f

# Database migrations
db-migrate:
	pnpm db:migrate

# Seed database
db-seed:
	pnpm db:seed

# Full setup
setup:
	./scripts/dev-setup.sh

# Generate secrets
secrets:
	./scripts/generate-secrets.sh

# Create new service
new-service:
	@read -p "Service name: " name; \
	./tools/generators/service.sh $$name

