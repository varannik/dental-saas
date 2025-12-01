#!/bin/bash

echo "🔐 Generating secrets..."

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
echo "JWT_SECRET=$JWT_SECRET"

# Generate cookie secret
COOKIE_SECRET=$(openssl rand -base64 32 | tr -d '\n')
echo "COOKIE_SECRET=$COOKIE_SECRET"

# Generate NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')
echo "NEXTAUTH_SECRET=$NEXTAUTH_SECRET"

echo ""
echo "⚠️  Remember to store these secrets securely!"
echo "    Do NOT commit them to version control."
echo ""
echo "For production, use a secrets manager like:"
echo "  - AWS Secrets Manager"
echo "  - HashiCorp Vault"
echo "  - Kubernetes Secrets (encrypted)"

