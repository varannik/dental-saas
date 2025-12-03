#!/bin/bash
set -e

echo "🚀 Setting up development environment..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20 or higher is required"
    exit 1
fi
echo "✅ Node.js version check passed"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    corepack enable
    corepack prepare pnpm@latest --activate
fi
echo "✅ pnpm is available"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed"
    exit 1
fi
echo "✅ Docker is available"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Copy environment files
echo "📝 Setting up environment files..."
if [ ! -f .env.local ]; then
    cp config/development/.env.example .env.local 2>/dev/null || true
    echo "Created .env.local from template"
fi

# Start infrastructure
echo "🐳 Starting Docker services..."
docker-compose -f infrastructure/docker/docker-compose.yml up -d postgres redis minio mailhog

# Wait for services
echo "⏳ Waiting for services to be ready..."
sleep 5

# Run database migrations
echo "🗃️ Running database migrations..."
pnpm db:migrate 2>/dev/null || echo "Migrations will run when services are implemented"

echo ""
echo "✅ Development environment is ready!"
echo ""
echo "To start the development servers:"
echo "  pnpm dev"
echo ""
echo "Available services:"
echo "  - Web App:     http://localhost:3000"
echo "  - API Gateway: http://localhost:3001"
echo "  - MailHog:     http://localhost:8025"
echo "  - MinIO:       http://localhost:9001"
echo ""

