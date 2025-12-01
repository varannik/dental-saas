# API Documentation

## Overview

The SaaS Platform API is a RESTful API that provides access to all platform functionality.

## Base URL

- Development: `http://localhost:3001/api`
- Staging: `https://api-staging.example.com/api`
- Production: `https://api.example.com/api`

## Authentication

All API requests (except public endpoints) require authentication via JWT Bearer token.

```http
Authorization: Bearer <access_token>
```

### Obtaining Tokens

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJhbGc..."
}
```

## Rate Limiting

- **Authenticated requests**: 1000 requests per minute
- **Unauthenticated requests**: 100 requests per minute

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000
```

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Validation Error",
  "message": "Email is required",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "email",
    "message": "Email is required"
  }
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

## Pagination

List endpoints support pagination:

```http
GET /api/users?page=1&limit=20
```

Response includes pagination metadata:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## Versioning

API versioning is handled via URL path:

```http
GET /api/v1/users
GET /api/v2/users
```

Currently supported versions: `v1`

## Endpoints

See individual service documentation:

- [Auth API](./auth.md)
- [Users API](./users.md)
- [Billing API](./billing.md)
- [Notifications API](./notifications.md)

