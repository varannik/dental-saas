# @saas/sdk

Client SDK for integrating with the SaaS API.

## Installation

```bash
npm install @saas/sdk
# or
pnpm add @saas/sdk
```

## Usage

```typescript
import { SaaSClient } from '@saas/sdk';

const client = new SaaSClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.example.com',
});

// Authentication
const { user, token } = await client.auth.login({
  email: 'user@example.com',
  password: 'password',
});

// Users
const users = await client.users.list();
const user = await client.users.get('user_123');

// Subscriptions
const subscription = await client.subscriptions.get();
await client.subscriptions.upgrade('plan_pro');
```

## Available Methods

### Auth

- `login(credentials)` - Login with email/password
- `register(data)` - Register new user
- `logout()` - Logout current user
- `refreshToken()` - Refresh access token

### Users

- `list(params?)` - List users
- `get(id)` - Get user by ID
- `update(id, data)` - Update user
- `delete(id)` - Delete user

### Subscriptions

- `get()` - Get current subscription
- `upgrade(planId)` - Upgrade subscription
- `cancel()` - Cancel subscription
- `getPlans()` - List available plans

## Configuration

```typescript
const client = new SaaSClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.example.com',
  timeout: 30000,
  retries: 3,
});
```

