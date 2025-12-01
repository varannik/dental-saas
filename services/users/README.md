# Users Service

Manages user profiles, preferences, and role-based access control.

## Structure

```
users/
├── src/
│   ├── index.ts
│   ├── config/
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   ├── middleware/
│   └── types/
├── tests/
├── migrations/
└── Dockerfile
```

## Features

- User profile management (CRUD)
- Role and permission management
- User preferences and settings
- Avatar/profile image handling
- Team/organization membership
- Activity tracking

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | List users (admin) |
| GET | `/users/:id` | Get user by ID |
| PUT | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |
| GET | `/users/:id/roles` | Get user roles |
| PUT | `/users/:id/roles` | Update user roles |

