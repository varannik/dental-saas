# Admin Dashboard

Internal admin dashboard for managing the SaaS platform.

## Structure

```
admin/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Dashboard routes
│   │   │   ├── users/          # User management
│   │   │   ├── tenants/        # Tenant management
│   │   │   ├── billing/        # Billing & subscriptions
│   │   │   ├── analytics/      # Platform analytics
│   │   │   └── settings/       # System settings
│   │   └── layout.tsx
│   ├── components/             # React components
│   ├── hooks/                  # Custom hooks
│   ├── lib/                    # Utilities
│   └── services/               # API services
└── package.json
```

## Features

- User management (CRUD, roles, permissions)
- Tenant/organization management
- Subscription and billing overview
- Platform analytics and metrics
- System configuration
- Audit logs

## Access Control

This dashboard requires admin-level permissions. Access is restricted to:
- Super Admins
- Platform Administrators

