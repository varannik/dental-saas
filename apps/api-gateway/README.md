# API Gateway

Central API Gateway for routing, authentication, and rate limiting.

## Structure

```
api-gateway/
├── src/
│   ├── index.ts                # Entry point
│   ├── config/                 # Configuration
│   │   └── routes.ts           # Route definitions
│   ├── middleware/             # Middleware
│   │   ├── auth.ts             # Authentication
│   │   ├── rate-limit.ts       # Rate limiting
│   │   ├── cors.ts             # CORS handling
│   │   └── logging.ts          # Request logging
│   ├── routes/                 # Route handlers
│   │   └── health.ts           # Health checks
│   └── utils/                  # Utilities
│       ├── logger.ts           # Logging
│       └── errors.ts           # Error handling
└── package.json
```

## Features

- Request routing to microservices
- JWT authentication & validation
- Rate limiting (per-user, per-IP)
- Request/response logging
- Health checks
- CORS configuration
- Request validation

## Routes

| Route | Service | Description |
|-------|---------|-------------|
| `/api/auth/*` | Auth Service | Authentication |
| `/api/users/*` | Users Service | User management |
| `/api/billing/*` | Billing Service | Subscriptions |
| `/api/notifications/*` | Notifications | Notifications |

