# Authentication Service

Handles user authentication, authorization, and session management.

## Structure

```
auth/
├── src/
│   ├── index.ts                # Entry point
│   ├── config/                 # Configuration
│   ├── controllers/            # Route controllers
│   │   ├── auth.controller.ts
│   │   ├── oauth.controller.ts
│   │   └── session.controller.ts
│   ├── services/               # Business logic
│   │   ├── auth.service.ts
│   │   ├── token.service.ts
│   │   ├── password.service.ts
│   │   └── oauth.service.ts
│   ├── repositories/           # Data access
│   │   ├── user.repository.ts
│   │   └── session.repository.ts
│   ├── middleware/             # Middleware
│   │   ├── auth.middleware.ts
│   │   └── validation.middleware.ts
│   ├── schemas/                # Validation schemas
│   ├── types/                  # TypeScript types
│   └── utils/                  # Utilities
├── tests/                      # Test files
│   ├── unit/
│   └── integration/
├── migrations/                 # Database migrations
└── Dockerfile
```

## Features

- Email/password authentication
- OAuth 2.0 (Google, GitHub, etc.)
- JWT token management
- Refresh token rotation
- Session management (Redis)
- Password reset flow
- Email verification
- MFA/2FA support
- Role-based access control (RBAC)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | User registration |
| POST | `/auth/login` | User login |
| POST | `/auth/logout` | User logout |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password |
| GET | `/auth/verify-email` | Verify email address |
| GET | `/auth/me` | Get current user |

