# @saas/api-gateway

Fastify-based API gateway for routing traffic to backend services.

## Local development

```bash
pnpm --filter @saas/api-gateway dev
```

Default port: `4000`

## Routes

- `GET /health`
- `POST/GET/... /api/v1/auth/*` -> proxied to auth service
- `POST/GET/... /api/v1/users/*` -> proxied to users service
- `... /api/v1/patients/*` -> placeholder (not implemented yet)
- `GET /api/v1/voice/ws` -> placeholder websocket route
