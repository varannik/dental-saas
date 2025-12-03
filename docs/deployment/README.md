# Deployment Guide

## Environments

| Environment | Purpose                | URL                 |
| ----------- | ---------------------- | ------------------- |
| Development | Local development      | localhost           |
| Staging     | Pre-production testing | staging.example.com |
| Production  | Live environment       | example.com         |

## Prerequisites

- Docker & Docker Compose
- Kubernetes CLI (kubectl)
- Helm 3.x
- AWS CLI (if using AWS)
- Access to container registry

## Deployment Methods

### 1. Docker Compose (Development)

```bash
# Start all services
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 2. Kubernetes (Production)

```bash
# Apply namespace and base resources
kubectl apply -f infrastructure/kubernetes/base/

# Deploy services
kubectl apply -f infrastructure/kubernetes/services/

# Apply ingress
kubectl apply -f infrastructure/kubernetes/ingress/
```

### 3. Helm (Recommended)

```bash
# Add dependencies
helm dependency update infrastructure/helm/saas-app

# Deploy to staging
helm upgrade --install saas-app ./infrastructure/helm/saas-app \
  --namespace staging \
  --values ./infrastructure/helm/saas-app/values-staging.yaml

# Deploy to production
helm upgrade --install saas-app ./infrastructure/helm/saas-app \
  --namespace production \
  --values ./infrastructure/helm/saas-app/values-production.yaml \
  --atomic
```

## CI/CD Pipeline

Deployments are automated via GitHub Actions:

1. **Push to `develop`** → Deploy to staging
2. **Push to `main`** → Deploy to production

### Manual Deployment

For manual deployments, use the GitHub Actions workflow dispatch:

1. Go to Actions → Deploy Production
2. Click "Run workflow"
3. Enter version tag
4. Confirm deployment

## Rollback Procedure

### Helm Rollback

```bash
# View history
helm history saas-app -n production

# Rollback to previous release
helm rollback saas-app -n production

# Rollback to specific revision
helm rollback saas-app 3 -n production
```

### Kubernetes Rollback

```bash
# Rollback deployment
kubectl rollout undo deployment/api-gateway -n production

# Rollback to specific revision
kubectl rollout undo deployment/api-gateway --to-revision=2 -n production
```

## Health Checks

After deployment, verify services are healthy:

```bash
# Run smoke tests
./scripts/test/smoke-tests.sh production

# Check pod status
kubectl get pods -n production

# Check service endpoints
kubectl get endpoints -n production
```

## Secrets Management

Production secrets are managed via:

1. **Kubernetes Secrets** (encrypted at rest)
2. **AWS Secrets Manager** / **HashiCorp Vault**

To update secrets:

```bash
# Update secret
kubectl create secret generic saas-secrets \
  --from-literal=JWT_SECRET=xxx \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Monitoring

After deployment, monitor:

- **Grafana Dashboard**: metrics and alerts
- **Log aggregation**: check for errors
- **APM**: trace request latency

## Troubleshooting

### Common Issues

1. **Pods not starting**
   - Check resource limits
   - Verify image pull secrets
   - Check pod events: `kubectl describe pod <pod-name>`

2. **Service unavailable**
   - Verify ingress configuration
   - Check service endpoints
   - Verify health check endpoints

3. **Database connection issues**
   - Verify connection string
   - Check network policies
   - Verify database credentials
