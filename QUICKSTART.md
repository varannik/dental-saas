# Quick Start Guide

Get the Dental SaaS Platform running on your local machine in under 5 minutes.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Docker Desktop** (v20.10+) - [Download](https://www.docker.com/products/docker-desktop)
- **Node.js** (v20+) - [Download](https://nodejs.org/)
- **Terraform** (v1.6+) - [Download](https://www.terraform.io/downloads)
- **Git** - [Download](https://git-scm.com/downloads)

### Optional but Recommended

- **jq** - JSON processor for parsing outputs
  ```bash
  # macOS
  brew install jq
  
  # Linux
  sudo apt-get install jq
  ```

- **AWS CLI** - Required for staging/production deployments
  ```bash
  # macOS
  brew install awscli
  
  # Linux
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
  unzip awscliv2.zip
  sudo ./aws/install
  ```

---

## 🚀 Quick Start (5 Minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/dental-saas.git
cd dental-saas
```

### 2. Fix Script Permissions (First Time Only)

```bash
make fix-permissions
```

This makes all shell scripts executable. You only need to do this once after cloning.

### 3. Check Dependencies

```bash
make check-deps
```

If any dependencies are missing, install them before continuing.

### 4. Complete Setup

```bash
make setup
```

This command will:
- ✅ Install all npm dependencies
- ✅ Start Docker containers (PostgreSQL, Redis, MinIO)
- ✅ Apply Terraform configuration
- ✅ Run database migrations
- ✅ Seed test data

**Expected time:** 2-3 minutes

### 5. Start Development Server

```bash
make dev
```

The application will be available at:
- **Web App**: http://localhost:3000
- **Admin App**: http://localhost:3001
- **API Gateway**: http://localhost:4000

---

## 🎯 What Just Happened?

The `make setup` command orchestrated the following:

1. **Docker Containers Started**:
   - PostgreSQL (port 5432)
   - Redis (port 6379)
   - MinIO (ports 9000, 9001)

2. **Terraform Applied**:
   - Created local infrastructure configuration
   - Set up connection strings

3. **Database Initialized**:
   - Ran migrations (created tables)
   - Seeded test data (sample users, patients)

4. **Ready to Develop**:
   - All services running
   - Test data available
   - Hot reload enabled

---

## 📚 Common Commands

### Development

```bash
make dev              # Start development server
make test             # Run all tests
make lint             # Run linter
make format           # Format code
make check            # Run all quality checks
```

### Local Environment

```bash
make local            # Start local environment
make local-stop       # Stop local environment
make local-restart    # Restart local environment
make local-reset      # Reset local environment (clean slate)
make local-status     # Show status of services
```

### Database

```bash
make db-migrate       # Run migrations
make db-seed          # Seed test data
make db-reset         # Reset database (drop, migrate, seed)
make db-console       # Open PostgreSQL console
```

### Docker

```bash
make docker-up        # Start Docker containers
make docker-down      # Stop Docker containers
make docker-logs      # Show container logs
make docker-clean     # Remove containers and volumes
make docker-ps        # Show running containers
```

### Redis

```bash
make redis-console    # Open Redis CLI
make redis-flush      # Flush Redis database
make redis-info       # Show Redis info
```

### Deployment

```bash
make deploy-staging      # Deploy to staging
make deploy-production   # Deploy to production
make logs-staging        # View staging logs
make status-staging      # Check staging status
```

### Help

```bash
make help             # Show all available commands
```

---

## 🗂️ Project Structure

```
dental-saas/
├── apps/                    # Frontend applications
│   ├── web/                # Patient-facing web app (Next.js)
│   ├── admin/              # Admin dashboard (Next.js)
│   └── mobile/             # Mobile app (React Native)
│
├── services/               # Backend microservices
│   ├── auth/              # Authentication service
│   ├── users/             # User management service
│   ├── billing/           # Billing service
│   ├── notifications/     # Notification service
│   └── files/             # File management service
│
├── packages/              # Shared packages
│   ├── ui/               # UI component library
│   ├── types/            # Shared TypeScript types
│   ├── utils/            # Shared utilities
│   └── config/           # Shared configuration
│
├── infrastructure/        # Infrastructure as Code
│   ├── terraform/        # Terraform configurations
│   └── docker/           # Docker Compose for local dev
│
├── scripts/              # Automation scripts
│   ├── lib/             # Shared libraries
│   ├── local/           # Local development scripts
│   ├── deploy/          # Deployment scripts
│   └── ...              # Other scripts
│
├── docs/                 # Documentation
│   ├── architecture/    # Architecture documentation
│   ├── api/             # API documentation
│   └── ux/              # UX guidelines
│
├── Makefile             # Command orchestration
└── package.json         # Root package.json (monorepo)
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root (already in `.gitignore`):

```bash
# Copy from example
cp .env.example .env

# Edit with your values
nano .env
```

### Local Development

All local configuration is in `infrastructure/terraform/environments/local.tfvars`.

No secrets needed for local development - defaults are fine.

### Staging/Production

Secrets are managed via:
1. **AWS Secrets Manager** (recommended)
2. **`.secrets.tfvars` files** (not in Git)

Generate secrets:
```bash
make secrets-generate
```

---

## 🧪 Testing

### Run All Tests

```bash
make test
```

### Run Specific Test Suites

```bash
make test-unit           # Unit tests only
make test-integration    # Integration tests only
make test-e2e            # End-to-end tests only
make test-coverage       # Tests with coverage report
```

### Watch Mode

```bash
make test-watch          # Run tests in watch mode
```

---

## 🐛 Troubleshooting

### Docker containers won't start

```bash
# Check if Docker is running
docker info

# Restart Docker Desktop (macOS)
# Or: sudo systemctl restart docker (Linux)

# Clean and restart
make docker-clean
make docker-up
```

### Port already in use

```bash
# Find process using port 5432 (PostgreSQL)
lsof -i :5432

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
```

### Database connection error

```bash
# Check if PostgreSQL is ready
docker exec dental-saas-postgres pg_isready -U postgres

# Check logs
make docker-logs

# Reset database
make db-reset
```

### Terraform errors

```bash
# Re-initialize Terraform
make terraform-init

# Check Terraform state
cd infrastructure/terraform && terraform state list

# Destroy and recreate
make terraform-destroy-local
make terraform-local
```

### npm install fails

```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules
make clean-deps

# Reinstall
make install
```

---

## 📖 Next Steps

### 1. Explore the Codebase

- Read the [Architecture Documentation](./docs/architecture/README.md)
- Review the [Data Schema](./docs/architecture/schema-core.md)
- Check the [API Documentation](./docs/api/README.md)

### 2. Make Your First Change

- Edit a file in `apps/web/src/`
- See hot reload in action
- Run tests: `make test`
- Commit your changes

### 3. Deploy to Staging

```bash
# Configure AWS CLI
aws configure

# Deploy
make deploy-staging
```

### 4. Learn the Workflow

- [Contributing Guide](./docs/contributing/CONTRIBUTING.md)
- [Style Guide](./docs/contributing/STYLE_GUIDE.md)
- [Git Workflow](./docs/contributing/GIT_WORKFLOW.md)

---

## 🆘 Getting Help

### Documentation

- [Full Documentation](./docs/)
- [Architecture Docs](./docs/architecture/)
- [API Docs](./docs/api/)
- [Scripts README](./scripts/README.md)

### Commands

```bash
make help              # Show all available commands
make check-deps        # Check if dependencies are installed
make local-status      # Show status of local services
```

### Common Issues

Check [Troubleshooting](#-troubleshooting) section above.

### Support

- Create an issue on GitHub
- Contact the team on Slack
- Email: dev@dental-saas.com

---

## ✅ Success Checklist

After running `make setup`, verify everything is working:

- [ ] Docker containers are running: `make docker-ps`
- [ ] PostgreSQL is accessible: `make db-console`
- [ ] Redis is accessible: `make redis-console`
- [ ] MinIO console is accessible: http://localhost:9001
- [ ] Tests pass: `make test`
- [ ] Dev server starts: `make dev`
- [ ] Web app loads: http://localhost:3000

If all checks pass, you're ready to develop! 🎉

---

## 🚀 What's Next?

Now that your environment is set up, you can:

1. **Start developing**: `make dev`
2. **Run tests**: `make test`
3. **Deploy to staging**: `make deploy-staging`
4. **Read the docs**: [Architecture](./docs/architecture/)

Happy coding! 🎉

