# Development Setup Guide

This guide explains how to set up your local development environment for the Dental SaaS Platform.

## Prerequisites

Ensure you have the following installed on your system:

- **Docker and Docker Compose**: For running the containerized services
- **Git**: For version control
- **Node.js** (v14+): For running scripts outside of containers
- **Python** (v3.9+): For running scripts outside of containers

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd dental-saas
```

### 2. Environment Configuration

Copy the example environment files for each service:

```bash
# Auth Service
cp backend/services/auth/.env.example backend/services/auth/.env

# Voice Service
cp backend/services/voice/.env.example backend/services/voice/.env

# Other services...
```

Edit the `.env` files if you need to customize any configuration.

### 3. Start the Docker Environment

From the project root directory, run:

```bash
docker-compose -f infrastructure/docker/docker-compose.yml up
```

This will:

1. Build all the service containers
2. Set up the required infrastructure (databases, storage, etc.)
3. Start all services with live reloading for development

To start specific services only, you can specify their names:

```bash
docker-compose -f infrastructure/docker/docker-compose.yml up auth-service patient-service
```

To rebuild services after making changes to Dockerfiles:

```bash
docker-compose -f infrastructure/docker/docker-compose.yml up --build
```

### 4. Access the Services

Once the environment is running, you can access the following:

- **Web Application**: http://dental.localhost
- **Admin Dashboard**: http://admin.dental.localhost
- **API Gateway Dashboard**: http://localhost:8080
- **MinIO Console**: http://localhost:9001 (Username: `minioadmin`, Password: `minioadmin`)

### 5. Database Initialization

The first time you start the environment, the databases will be initialized automatically. However, you can manually run migrations if needed:

```bash
# From within the running container
docker-compose -f infrastructure/docker/docker-compose.yml exec auth-service npm run migrate

# Or directly from your machine
cd backend/services/auth
npm run migrate
```

### 6. Setting Up a Development Tenant

For local development, you can create a test tenant via the API:

```bash
curl -X POST http://api.dental.localhost/api/auth/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Dental Practice",
    "domain": "test.dental.local",
    "email": "admin@test.dental.local",
    "password": "password123",
    "plan": "basic"
  }'
```

This will create a new tenant and return an authentication token you can use for subsequent API calls.

### 7. Running Tests

To run tests for a specific service:

```bash
# Auth Service
docker-compose -f infrastructure/docker/docker-compose.yml exec auth-service npm test

# Voice Service
docker-compose -f infrastructure/docker/docker-compose.yml exec voice-service pytest
```

## Development Workflow

### Making Changes

- **Backend Services**: Changes to JavaScript/TypeScript files will be automatically applied thanks to Nodemon.
- **Python Services**: Changes to Python files will be automatically applied thanks to Uvicorn's reload feature.
- **Frontend**: Changes to React components will be automatically applied thanks to Webpack's hot module replacement.

### Adding Dependencies

If you need to add new dependencies:

1. Add them to the appropriate package.json/requirements.txt file
2. Rebuild the container: `docker-compose -f infrastructure/docker/docker-compose.yml up --build <service-name>`

### Database Changes

For schema changes:

1. Create migration scripts in the appropriate service's `/migrations` directory
2. Apply migrations as described in the "Database Initialization" section

## Troubleshooting

### Common Issues

1. **Port conflicts**: If you have services already running on the required ports, you'll see binding errors. Change the port mappings in `docker-compose.yml` if needed.

2. **Database connection issues**: Make sure the database containers are running. You can check logs with:
   ```bash
   docker-compose -f infrastructure/docker/docker-compose.yml logs postgres
   docker-compose -f infrastructure/docker/docker-compose.yml logs mongo
   ```

3. **API Gateway issues**: The Traefik container might fail if you have another reverse proxy running. Check its logs with:
   ```bash
   docker-compose -f infrastructure/docker/docker-compose.yml logs api-gateway
   ```

### Viewing Logs

To view logs for a specific service:

```bash
docker-compose -f infrastructure/docker/docker-compose.yml logs -f <service-name>
```

### Restarting Services

To restart a specific service:

```bash
docker-compose -f infrastructure/docker/docker-compose.yml restart <service-name>
```

### Resetting the Environment

If you need a clean slate:

```bash
docker-compose -f infrastructure/docker/docker-compose.yml down -v
docker-compose -f infrastructure/docker/docker-compose.yml up
```

Note that this will remove all data including database volumes. 