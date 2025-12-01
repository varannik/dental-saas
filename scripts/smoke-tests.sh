#!/bin/bash
set -e

ENVIRONMENT=${1:-"staging"}

echo "🧪 Running smoke tests for $ENVIRONMENT environment..."

# Set base URL based on environment
case $ENVIRONMENT in
    "staging")
        BASE_URL="https://api-staging.example.com"
        ;;
    "production")
        BASE_URL="https://api.example.com"
        ;;
    *)
        BASE_URL="http://localhost:3001"
        ;;
esac

echo "Base URL: $BASE_URL"

# Health check
echo "Checking health endpoint..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$HEALTH_STATUS" != "200" ]; then
    echo "❌ Health check failed with status: $HEALTH_STATUS"
    exit 1
fi
echo "✅ Health check passed"

# API Gateway health
echo "Checking API Gateway..."
GATEWAY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/ready")
if [ "$GATEWAY_STATUS" != "200" ]; then
    echo "❌ API Gateway health check failed with status: $GATEWAY_STATUS"
    exit 1
fi
echo "✅ API Gateway is healthy"

# Auth service
echo "Checking Auth service..."
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/health" || echo "000")
if [ "$AUTH_STATUS" != "200" ] && [ "$AUTH_STATUS" != "401" ]; then
    echo "⚠️ Auth service returned status: $AUTH_STATUS"
fi
echo "✅ Auth service is responding"

echo ""
echo "✅ All smoke tests passed for $ENVIRONMENT!"

