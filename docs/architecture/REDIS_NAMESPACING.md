# Redis Namespacing Strategy

## Overview

This document explains the namespacing strategy for sharing a single Redis instance across multiple microservices in the Dental AI SaaS platform.

**Date:** December 2, 2024  
**Status:** ✅ Complete

---

## Problem Statement

**Question:** "Current Redis design handles the namespace? Because I need one Redis resource for other microservices also."

**Answer:** ✅ **Yes, the updated design now includes comprehensive namespacing!**

---

## Solution: Service-Based Namespacing

### **Key Pattern**

```
{service}:{resource_type}:{identifier}
```

### **Examples**

```
auth:session:550e8400-e29b-41d4-a716-446655440000
auth:blacklist:a3f5d8c9b2e1f4a7d6c8b5e9f2a1d4c7
auth:permissions:123e4567:789e0123
auth:rate_limit:789e0123:123e4567

users:profile:123e4567-e89b-12d3-a456-426614174000
users:settings:123e4567-e89b-12d3-a456-426614174000

billing:invoice:456e7890-a12b-34c5-d678-901234567def
billing:subscription:789e0123-e45b-67c8-d901-234567890abc

notifications:queue:789e0123:123e4567
notifications:unread_count:123e4567

files:upload_token:abc123def456
files:download_url:def456ghi789

ai:inference_job:550e8400-e29b-41d4-a716-446655440000
ai:model_cache:caries_detection_v2

agent:approval_queue:789e0123:123e4567
agent:execution_state:550e8400-e29b-41d4-a716-446655440000

shared:tenant_config:789e0123
shared:features:789e0123
```

---

## Service Namespaces

| Service | Namespace | Keys | Purpose |
|---------|-----------|------|---------|
| **auth** | `auth:*` | Sessions, JWT blacklist, permissions cache, rate limiting | Authentication & authorization |
| **users** | `users:*` | User profiles, settings, preferences, online status | User management |
| **billing** | `billing:*` | Invoices, subscriptions, payment status, usage counters | Billing & subscriptions |
| **notifications** | `notifications:*` | Notification queues, unread counts, pub/sub channels | Real-time notifications |
| **files** | `files:*` | Upload tokens, download URLs, processing status | File management |
| **ai** | `ai:*` | Inference jobs, model cache, prediction results | AI/ML services |
| **agent** | `agent:*` | Approval queues, workflow state, tool execution | AI agent orchestration |
| **shared** | `shared:*` | Tenant config, feature flags, maintenance mode | Cross-service data |

---

## Implementation

### **TypeScript Helper (Recommended)**

```typescript
// lib/redis-keys.ts

export const RedisKeys = {
  // Auth Service
  auth: {
    session: (sessionId: string) => `auth:session:${sessionId}`,
    blacklist: (tokenHash: string) => `auth:blacklist:${tokenHash}`,
    permissions: (userId: string, tenantId: string) => `auth:permissions:${userId}:${tenantId}`,
    rateLimit: (tenantId: string, userId: string) => `auth:rate_limit:${tenantId}:${userId}`,
    mfaCode: (userId: string) => `auth:mfa_code:${userId}`,
  },

  // Users Service
  users: {
    profile: (userId: string) => `users:profile:${userId}`,
    settings: (userId: string) => `users:settings:${userId}`,
    onlineStatus: (userId: string) => `users:online:${userId}`,
  },

  // Billing Service
  billing: {
    invoice: (invoiceId: string) => `billing:invoice:${invoiceId}`,
    subscription: (tenantId: string) => `billing:subscription:${tenantId}`,
    usageCounter: (tenantId: string, month: string) => `billing:usage:${tenantId}:${month}`,
    paymentIntent: (intentId: string) => `billing:payment_intent:${intentId}`,
  },

  // Notifications Service
  notifications: {
    queue: (tenantId: string, userId: string) => `notifications:queue:${tenantId}:${userId}`,
    unreadCount: (userId: string) => `notifications:unread:${userId}`,
    channel: (tenantId: string, userId: string) => `notifications:channel:${tenantId}:${userId}`,
  },

  // Files Service
  files: {
    uploadToken: (tokenId: string) => `files:upload_token:${tokenId}`,
    downloadUrl: (fileId: string) => `files:download_url:${fileId}`,
    processingStatus: (fileId: string) => `files:processing:${fileId}`,
  },

  // AI Service
  ai: {
    inferenceJob: (jobId: string) => `ai:inference_job:${jobId}`,
    modelCache: (modelId: string, version: string) => `ai:model_cache:${modelId}:${version}`,
    predictionResult: (predictionId: string) => `ai:prediction:${predictionId}`,
  },

  // Agent Service
  agent: {
    approvalQueue: (tenantId: string, userId: string) => `agent:approval_queue:${tenantId}:${userId}`,
    executionState: (executionId: string) => `agent:execution:${executionId}`,
    toolCache: (toolId: string) => `agent:tool_cache:${toolId}`,
  },

  // Shared (cross-service)
  shared: {
    tenantConfig: (tenantId: string) => `shared:tenant_config:${tenantId}`,
    featureFlags: (tenantId: string) => `shared:features:${tenantId}`,
    maintenanceMode: () => `shared:maintenance_mode`,
  },
} as const;
```

### **Usage Examples**

```typescript
// Auth Service
await redis.setex(
  RedisKeys.auth.session(sessionId),
  86400,
  JSON.stringify(sessionData)
);

const session = await redis.get(RedisKeys.auth.session(sessionId));

// Users Service
await redis.setex(
  RedisKeys.users.profile(userId),
  300,
  JSON.stringify(profile)
);

// Billing Service
await redis.incr(
  RedisKeys.billing.usageCounter(tenantId, '2024-12')
);

// Notifications Service
await redis.lpush(
  RedisKeys.notifications.queue(tenantId, userId),
  JSON.stringify(notification)
);

// Agent Service
await redis.lpush(
  RedisKeys.agent.approvalQueue(tenantId, userId),
  JSON.stringify(approvalRequest)
);
```

---

## Benefits

### ✅ **Prevents Key Collisions**

Without namespacing:
```
❌ session:123  (which service owns this?)
❌ cache:user   (auth or users service?)
❌ queue:456    (notifications or agent?)
```

With namespacing:
```
✅ auth:session:123
✅ users:profile:456
✅ agent:approval_queue:789:123
```

### ✅ **Service-Specific Monitoring**

```bash
# Count keys per service
redis-cli --scan --pattern "auth:*" | wc -l
redis-cli --scan --pattern "users:*" | wc -l
redis-cli --scan --pattern "billing:*" | wc -l
redis-cli --scan --pattern "agent:*" | wc -l

# Memory usage per service
redis-cli --scan --pattern "auth:*" | xargs redis-cli DEBUG OBJECT | grep serializedlength
```

### ✅ **Selective Cache Invalidation**

```typescript
// Invalidate all auth cache for a user
async function invalidateUserAuthCache(userId: string, tenantId: string) {
  await redis.del(
    RedisKeys.auth.permissions(userId, tenantId),
    RedisKeys.auth.rateLimit(tenantId, userId)
  );
}

// Invalidate all billing cache for a tenant
async function invalidateTenantBillingCache(tenantId: string) {
  const keys = await redis.keys(`billing:*:${tenantId}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

### ✅ **Easier Debugging**

```bash
# Find all sessions
redis-cli --scan --pattern "auth:session:*"

# Find all approval queues
redis-cli --scan --pattern "agent:approval_queue:*"

# Find all data for a specific tenant
redis-cli --scan --pattern "*:789e0123*"
```

### ✅ **Type Safety (TypeScript)**

```typescript
// ✅ Type-safe, autocomplete works
await redis.get(RedisKeys.auth.session(sessionId));

// ❌ Typo-prone, no autocomplete
await redis.get(`auth:sesion:${sessionId}`); // typo!
```

---

## Naming Rules

### ✅ **Do's**

1. **Always use service prefix** - `auth:session:*` not `session:*`
2. **Use colons (:) as separators** - Standard Redis convention
3. **Use lowercase** - Consistent, easier to debug
4. **Use UUIDs for identifiers** - Avoid collisions
5. **Be descriptive** - `auth:session:*` not `auth:s:*`
6. **Include tenant_id when relevant** - For multi-tenant isolation

### ❌ **Don'ts**

1. **Don't omit service prefix** - `session:123` ❌
2. **Don't use underscores** - `auth_session_123` ❌
3. **Don't use uppercase** - `AUTH:SESSION:123` ❌
4. **Don't be cryptic** - `a:s:123` ❌
5. **Don't forget identifiers** - `auth:session` ❌

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│           Single Redis Instance                 │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ auth:*                                  │   │
│  │ ✓ auth:session:{id}                     │   │
│  │ ✓ auth:permissions:{user}:{tenant}      │   │
│  │ ✓ auth:rate_limit:{tenant}:{user}       │   │
│  │ ✓ auth:blacklist:{token_hash}           │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ users:*                                 │   │
│  │ ✓ users:profile:{id}                    │   │
│  │ ✓ users:settings:{id}                   │   │
│  │ ✓ users:online:{id}                     │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ billing:*                               │   │
│  │ ✓ billing:subscription:{tenant}         │   │
│  │ ✓ billing:usage:{tenant}:{month}        │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ notifications:*                         │   │
│  │ ✓ notifications:queue:{tenant}:{user}   │   │
│  │ ✓ notifications:channel:{tenant}:{user} │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ agent:*                                 │   │
│  │ ✓ agent:approval_queue:{tenant}:{user}  │   │
│  │ ✓ agent:execution:{id}                  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ shared:*                                │   │
│  │ ✓ shared:tenant_config:{tenant}         │   │
│  │ ✓ shared:features:{tenant}              │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## Monitoring

### **Prometheus Metrics**

```yaml
# Keys by service
- metric: redis_keys_by_service
  query: count(redis_db_keys{key_pattern="auth:*"})
  labels:
    service: auth

- metric: redis_keys_by_service
  query: count(redis_db_keys{key_pattern="users:*"})
  labels:
    service: users

- metric: redis_keys_by_service
  query: count(redis_db_keys{key_pattern="agent:*"})
  labels:
    service: agent

# Memory by service
- metric: redis_memory_by_service
  query: sum(redis_key_memory_bytes{key_pattern="auth:*"})
  labels:
    service: auth
```

### **Grafana Dashboard**

```json
{
  "dashboard": {
    "title": "Redis by Service",
    "panels": [
      {
        "title": "Keys by Service",
        "targets": [
          { "expr": "redis_keys_by_service", "legendFormat": "{{service}}" }
        ]
      },
      {
        "title": "Memory by Service",
        "targets": [
          { "expr": "redis_memory_by_service", "legendFormat": "{{service}}" }
        ]
      }
    ]
  }
}
```

---

## Alternative: Separate Redis Databases

Instead of namespacing, you could use separate Redis databases:

```typescript
export const authRedis = new Redis({ host: '...', db: 0 });
export const usersRedis = new Redis({ host: '...', db: 1 });
export const billingRedis = new Redis({ host: '...', db: 2 });
export const notificationsRedis = new Redis({ host: '...', db: 3 });
export const filesRedis = new Redis({ host: '...', db: 4 });
export const aiRedis = new Redis({ host: '...', db: 5 });
export const agentRedis = new Redis({ host: '...', db: 6 });
export const sharedRedis = new Redis({ host: '...', db: 7 });
```

**Pros:**
- ✅ Complete isolation
- ✅ Per-service eviction policies
- ✅ Simpler key names

**Cons:**
- ❌ Limited to 16 databases (default)
- ❌ Cannot use Redis Cluster (cluster mode doesn't support multiple DBs)
- ❌ More complex connection management

**Recommendation:** ✅ **Use namespacing** (not separate DBs) for production, especially if you plan to use Redis Cluster.

---

## Migration Plan

### **Phase 1: Add Helper Functions (Week 1)**
- ✅ Create `lib/redis-keys.ts` with all namespace helpers
- ✅ Update documentation with namespace examples
- ✅ Add unit tests for key generation

### **Phase 2: Update Auth Service (Week 2)**
- ✅ Replace all `session:*` with `auth:session:*`
- ✅ Replace all `permissions:*` with `auth:permissions:*`
- ✅ Replace all `rate_limit:*` with `auth:rate_limit:*`
- ✅ Replace all `blacklist:*` with `auth:blacklist:*`

### **Phase 3: Update Other Services (Week 3-4)**
- ✅ Users service: `users:*`
- ✅ Billing service: `billing:*`
- ✅ Notifications service: `notifications:*`
- ✅ Files service: `files:*`
- ✅ AI service: `ai:*`
- ✅ Agent service: `agent:*`

### **Phase 4: Cleanup (Week 5)**
- ✅ Remove old keys (after verifying new keys work)
- ✅ Update monitoring dashboards
- ✅ Add alerts for key count per service

---

## Testing

### **Unit Tests**

```typescript
// __tests__/redis-keys.test.ts
import { RedisKeys } from '@/lib/redis-keys';

describe('RedisKeys', () => {
  it('should generate auth session key', () => {
    const key = RedisKeys.auth.session('123');
    expect(key).toBe('auth:session:123');
  });

  it('should generate auth permissions key', () => {
    const key = RedisKeys.auth.permissions('user123', 'tenant456');
    expect(key).toBe('auth:permissions:user123:tenant456');
  });

  it('should generate agent approval queue key', () => {
    const key = RedisKeys.agent.approvalQueue('tenant789', 'user123');
    expect(key).toBe('agent:approval_queue:tenant789:user123');
  });
});
```

### **Integration Tests**

```typescript
// __tests__/integration/redis-namespacing.test.ts
import Redis from 'ioredis';
import { RedisKeys } from '@/lib/redis-keys';

describe('Redis Namespacing', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis({ host: 'localhost', db: 15 });
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('should isolate keys by service', async () => {
    // Create keys for different services
    await redis.set(RedisKeys.auth.session('123'), 'auth-data');
    await redis.set(RedisKeys.users.profile('123'), 'user-data');
    await redis.set(RedisKeys.agent.executionState('123'), 'agent-data');

    // Verify isolation
    const authKeys = await redis.keys('auth:*');
    const userKeys = await redis.keys('users:*');
    const agentKeys = await redis.keys('agent:*');

    expect(authKeys.length).toBe(1);
    expect(userKeys.length).toBe(1);
    expect(agentKeys.length).toBe(1);
  });

  it('should allow selective invalidation', async () => {
    // Create multiple auth keys
    await redis.set(RedisKeys.auth.session('123'), 'data1');
    await redis.set(RedisKeys.auth.permissions('user1', 'tenant1'), 'data2');
    await redis.set(RedisKeys.users.profile('123'), 'data3');

    // Delete only auth keys
    const authKeys = await redis.keys('auth:*');
    await redis.del(...authKeys);

    // Verify auth keys deleted, user keys remain
    const remainingAuthKeys = await redis.keys('auth:*');
    const remainingUserKeys = await redis.keys('users:*');

    expect(remainingAuthKeys.length).toBe(0);
    expect(remainingUserKeys.length).toBe(1);
  });
});
```

---

## Summary

### ✅ **Changes Made**

1. **Added comprehensive namespacing section** to `redis-patterns.md`
2. **Updated all key patterns** to include service prefixes:
   - `session:*` → `auth:session:*`
   - `permissions:*` → `auth:permissions:*`
   - `rate_limit:*` → `auth:rate_limit:*`
   - `blacklist:*` → `auth:blacklist:*`
   - `approvals:*` → `agent:approval_queue:*`
   - `notifications:*` → `notifications:channel:*`
   - `tenant_config:*` → `shared:tenant_config:*`
3. **Created TypeScript helper** (`RedisKeys`) for type-safe key generation
4. **Updated all code examples** to use namespaced keys
5. **Added monitoring guidance** for per-service metrics

### ✅ **Benefits**

- ✅ **No key collisions** across microservices
- ✅ **Service-specific monitoring** (keys, memory, operations)
- ✅ **Selective cache invalidation** (per service or per tenant)
- ✅ **Easier debugging** (know which service owns which keys)
- ✅ **Type-safe** (TypeScript autocomplete)
- ✅ **Redis Cluster compatible** (unlike separate DBs)

### ✅ **Ready for Production**

All Redis patterns now include proper namespacing and are ready for shared Redis deployment across multiple microservices!

---

**Status:** ✅ **Namespacing strategy complete and documented!**

