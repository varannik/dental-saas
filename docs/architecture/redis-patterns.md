# Redis Patterns & Configuration

## Overview

This document defines Redis usage patterns for the Dental AI SaaS platform. Redis serves as the **primary session store** and **high-performance cache layer**, complementing PostgreSQL (source of truth) and object storage (large files).

---

## Architecture Decision

### **Why Redis for Sessions?**

| Requirement | PostgreSQL | Redis | Winner |
|------------|------------|-------|--------|
| Lookup speed | 10-50ms | <1ms | ✅ Redis |
| Automatic expiry | Manual cleanup job | Built-in TTL | ✅ Redis |
| Horizontal scaling | Complex (sharding) | Simple (cluster) | ✅ Redis |
| Memory efficiency | Disk-based | In-memory | ✅ Redis |
| Real-time features | Limited | Pub/Sub, Streams | ✅ Redis |
| Audit trail | ✅ Native | ❌ Ephemeral | PostgreSQL |

**Decision**: Use **Redis as primary** for active sessions, **PostgreSQL as secondary** for audit/compliance.

---

## Redis Data Structures

### **1. User Sessions**

**Key Pattern**: `session:{session_id}`

**Value**: JSON object

**TTL**: 24 hours (configurable per tenant)

**Example**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "tenant_id": "789e0123-e45b-67c8-d901-234567890abc",
  "email": "dr.smith@example.com",
  "full_name": "Dr. Jane Smith",
  "user_type": "DENTIST",
  "roles": ["CLINICIAN", "ADMIN"],
  "permissions": [
    "patient.read",
    "patient.write",
    "imaging.view",
    "imaging.run_ai",
    "note.write"
  ],
  "default_location_id": "456e7890-a12b-34c5-d678-901234567def",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "created_at": "2024-12-02T10:00:00Z",
  "last_activity_at": "2024-12-02T14:30:00Z"
}
```

**Operations**:
```redis
# Create session (24-hour TTL)
SETEX session:550e8400-e29b-41d4-a716-446655440000 86400 "{...json...}"

# Get session
GET session:550e8400-e29b-41d4-a716-446655440000

# Extend session (refresh TTL)
EXPIRE session:550e8400-e29b-41d4-a716-446655440000 86400

# Delete session (logout)
DEL session:550e8400-e29b-41d4-a716-446655440000

# Check if session exists
EXISTS session:550e8400-e29b-41d4-a716-446655440000
```

---

### **2. Permission Cache**

**Key Pattern**: `permissions:{user_id}:{tenant_id}`

**Value**: JSON array

**TTL**: 5 minutes

**Purpose**: Avoid hitting PostgreSQL for every permission check

**Example**:
```json
[
  "patient.read",
  "patient.write",
  "imaging.view",
  "imaging.run_ai",
  "note.write",
  "appointment.schedule"
]
```

**Operations**:
```redis
# Cache permissions (5-minute TTL)
SETEX permissions:123e4567-e89b-12d3-a456-426614174000:789e0123-e45b-67c8-d901-234567890abc 300 "[\"patient.read\",\"patient.write\"]"

# Get cached permissions
GET permissions:123e4567-e89b-12d3-a456-426614174000:789e0123-e45b-67c8-d901-234567890abc

# Invalidate cache (when roles change)
DEL permissions:123e4567-e89b-12d3-a456-426614174000:789e0123-e45b-67c8-d901-234567890abc
```

**Cache Invalidation Triggers**:
- User role assignment changed
- Role permissions modified
- User removed from tenant
- Manual cache flush (admin action)

---

### **3. Rate Limiting**

**Key Pattern**: `rate_limit:{tenant_id}:{user_id}` or `rate_limit:{tenant_id}:{api_client_id}`

**Value**: Integer counter

**TTL**: 60 seconds (1-minute sliding window)

**Purpose**: Enforce API rate limits per user/tenant

**Example**:
```redis
# Increment counter
INCR rate_limit:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000
# Returns: 1

# Set expiry on first request
EXPIRE rate_limit:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000 60

# Check current count
GET rate_limit:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000
# Returns: 42

# Check TTL (time until reset)
TTL rate_limit:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000
# Returns: 37 (seconds remaining)
```

**Rate Limit Logic**:
```typescript
const key = `rate_limit:${tenantId}:${userId}`;
const count = await redis.incr(key);

if (count === 1) {
  // First request in this window - set expiry
  await redis.expire(key, 60);
}

const limit = user.rate_limit_per_minute || 100;

if (count > limit) {
  const ttl = await redis.ttl(key);
  throw new RateLimitError(`Rate limit exceeded. Retry in ${ttl} seconds.`);
}
```

---

### **4. JWT Blacklist (Logout)**

**Key Pattern**: `blacklist:{token_hash}`

**Value**: String (e.g., "revoked")

**TTL**: Same as original JWT expiry

**Purpose**: Invalidate JWTs before natural expiry (logout, password change, security breach)

**Example**:
```redis
# Blacklist token (SHA256 hash)
SETEX blacklist:a3f5d8c9b2e1f4a7d6c8b5e9f2a1d4c7b8e5f9a2d1c4b7e8f5a9d2c1b4e7f8a5 86400 "revoked"

# Check if token is blacklisted
EXISTS blacklist:a3f5d8c9b2e1f4a7d6c8b5e9f2a1d4c7b8e5f9a2d1c4b7e8f5a9d2c1b4e7f8a5
# Returns: 1 (blacklisted) or 0 (valid)
```

**Blacklist Triggers**:
- User logout (voluntary)
- Admin revokes session
- Password change (invalidate all sessions)
- Security breach detected
- User account disabled

---

### **5. Real-Time Approval Queue**

**Key Pattern**: `approvals:{tenant_id}:{user_id}`

**Data Structure**: List (FIFO queue)

**TTL**: None (manually managed)

**Purpose**: Queue pending approval requests for voice commands and AI actions

**Example**:
```redis
# Push approval request to queue
LPUSH approvals:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000 "{\"approval_id\":\"...\",\"action\":\"update_dental_chart\",\"priority\":\"HIGH\"}"

# Get pending approvals (non-blocking)
LRANGE approvals:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000 0 -1

# Pop approval (blocking, wait up to 5 seconds)
BRPOP approvals:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000 5

# Remove specific approval
LREM approvals:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000 1 "{\"approval_id\":\"...\"}"
```

---

### **6. Pub/Sub for Real-Time Notifications**

**Channel Pattern**: `notifications:{tenant_id}:{user_id}`

**Purpose**: Real-time push notifications for approval requests, AI job completion, etc.

**Example**:
```redis
# Subscribe to notifications (client-side)
SUBSCRIBE notifications:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000

# Publish notification (server-side)
PUBLISH notifications:789e0123-e45b-67c8-d901-234567890abc:123e4567-e89b-12d3-a456-426614174000 "{\"type\":\"NEW_APPROVAL\",\"approval_id\":\"...\"}"
```

**Notification Types**:
- `NEW_APPROVAL` - New approval request pending
- `APPROVAL_TIMEOUT` - Approval request expired
- `AI_JOB_COMPLETE` - AI inference job finished
- `VOICE_SESSION_END` - Voice session ended
- `SYSTEM_ALERT` - System-wide alert

---

### **7. Tenant Configuration Cache**

**Key Pattern**: `tenant_config:{tenant_id}`

**Value**: JSON object

**TTL**: 15 minutes

**Purpose**: Cache tenant settings to avoid repeated PostgreSQL queries

**Example**:
```json
{
  "tenant_id": "789e0123-e45b-67c8-d901-234567890abc",
  "name": "Smile Dental Group",
  "type": "GROUP_PRACTICE",
  "status": "ACTIVE",
  "features": ["AI_DIAGNOSTICS", "VOICE_COMMANDS", "ORTHO_PLANNING"],
  "quotas": {
    "max_users": 50,
    "max_storage_gb": 1000,
    "max_ai_inferences_per_month": 10000,
    "api_rate_limit_per_minute": 100
  },
  "settings": {
    "default_session_ttl_hours": 24,
    "require_mfa": true,
    "voice_recording_retention_days": 90
  }
}
```

**Operations**:
```redis
# Cache tenant config (15-minute TTL)
SETEX tenant_config:789e0123-e45b-67c8-d901-234567890abc 900 "{...json...}"

# Get cached config
GET tenant_config:789e0123-e45b-67c8-d901-234567890abc

# Invalidate cache (when settings change)
DEL tenant_config:789e0123-e45b-67c8-d901-234567890abc
```

---

## Redis Configuration

### **Connection Settings**

```typescript
// config/redis.ts
import Redis from 'ioredis';

// Primary Redis instance (sessions, cache)
export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0, // Database 0 for sessions
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000
});

// Separate Redis instance for pub/sub (recommended)
export const redisPubSub = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0
});

// Optional: Separate Redis instance for cache (different eviction policy)
export const redisCache = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 1 // Database 1 for cache
});

// Error handling
redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('ready', () => {
  console.log('Redis ready');
});
```

---

### **Production Configuration**

**redis.conf** (or managed service settings):

```conf
# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru  # Evict least recently used keys when memory limit reached

# Persistence (optional - sessions are ephemeral)
save ""  # Disable RDB snapshots for session store
appendonly no  # Disable AOF for session store

# Security
requirepass <strong-password>
bind 0.0.0.0  # Or specific IP
protected-mode yes

# Performance
tcp-backlog 511
timeout 0
tcp-keepalive 300
maxclients 10000

# Slow log
slowlog-log-slower-than 10000  # 10ms
slowlog-max-len 128
```

**For Cache Redis Instance (DB 1)**:
```conf
maxmemory-policy allkeys-lru  # Evict LRU for cache
```

**For Persistent Redis (if needed)**:
```conf
appendonly yes
appendfsync everysec
```

---

## High Availability

### **Redis Sentinel (Automatic Failover)**

```typescript
// config/redis-sentinel.ts
import Redis from 'ioredis';

export const redis = new Redis({
  sentinels: [
    { host: 'sentinel1.example.com', port: 26379 },
    { host: 'sentinel2.example.com', port: 26379 },
    { host: 'sentinel3.example.com', port: 26379 }
  ],
  name: 'mymaster',
  password: process.env.REDIS_PASSWORD,
  db: 0,
  sentinelPassword: process.env.SENTINEL_PASSWORD
});
```

---

### **Redis Cluster (Horizontal Scaling)**

```typescript
// config/redis-cluster.ts
import Redis from 'ioredis';

export const redis = new Redis.Cluster([
  { host: 'redis-node1.example.com', port: 6379 },
  { host: 'redis-node2.example.com', port: 6379 },
  { host: 'redis-node3.example.com', port: 6379 },
  { host: 'redis-node4.example.com', port: 6379 },
  { host: 'redis-node5.example.com', port: 6379 },
  { host: 'redis-node6.example.com', port: 6379 }
], {
  redisOptions: {
    password: process.env.REDIS_PASSWORD
  },
  clusterRetryStrategy: (times) => {
    return Math.min(100 * times, 2000);
  }
});
```

---

## Monitoring & Metrics

### **Key Metrics to Track**

```bash
# Memory usage
INFO memory

# Hit rate (cache effectiveness)
INFO stats
# Look for: keyspace_hits, keyspace_misses
# Hit rate = keyspace_hits / (keyspace_hits + keyspace_misses)

# Connected clients
INFO clients

# Operations per second
INFO stats
# Look for: instantaneous_ops_per_sec

# Slow commands
SLOWLOG GET 10

# Key count by database
INFO keyspace
```

### **Prometheus Metrics (redis_exporter)**

```yaml
# Key metrics to alert on:
- redis_up == 0  # Redis down
- redis_memory_used_bytes / redis_memory_max_bytes > 0.9  # Memory usage > 90%
- rate(redis_keyspace_misses_total[5m]) / rate(redis_keyspace_hits_total[5m]) > 0.5  # Cache hit rate < 50%
- redis_connected_clients > 9000  # Near max clients
- redis_blocked_clients > 10  # Too many blocked clients
```

---

## Best Practices

### ✅ **Do's**

1. **Use TTLs for all keys** - Prevent memory leaks
2. **Use pipelining** - Batch multiple commands for better performance
3. **Use connection pooling** - Reuse connections
4. **Monitor memory usage** - Set alerts for high memory
5. **Use separate Redis instances** - Sessions (DB 0), Cache (DB 1), Pub/Sub (separate connection)
6. **Hash large objects** - Use SHA256 for JWT blacklist keys
7. **Use Redis Cluster for scale** - Horizontal scaling for millions of sessions
8. **Implement circuit breakers** - Graceful degradation if Redis is down

### ❌ **Don'ts**

1. **Don't use Redis as source of truth** - PostgreSQL is authoritative
2. **Don't store PHI in Redis** - Only store user_id, tenant_id (references)
3. **Don't use KEYS command in production** - Use SCAN instead
4. **Don't use blocking commands in web requests** - Use BLPOP/BRPOP only in background workers
5. **Don't forget to handle Redis failures** - Implement fallback to PostgreSQL
6. **Don't use Redis for long-term storage** - Use PostgreSQL for audit logs
7. **Don't use SELECT to switch databases** - Use separate connections
8. **Don't use Redis transactions (MULTI/EXEC) unnecessarily** - Use Lua scripts instead

---

## Fallback Strategy (Redis Unavailable)

### **Graceful Degradation**

```typescript
// middleware/auth.middleware.ts
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // 1. Verify JWT signature
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 2. Try Redis first (fast path)
    try {
      const sessionData = await redis.get(`session:${decoded.session_id}`);
      
      if (sessionData) {
        const session = JSON.parse(sessionData);
        req.user_id = session.user_id;
        req.tenant_id = session.tenant_id;
        req.roles = session.roles;
        req.permissions = session.permissions;
        return next();
      }
    } catch (redisError) {
      console.warn('Redis unavailable, falling back to PostgreSQL', redisError);
    }
    
    // 3. Fallback to PostgreSQL (slow path)
    const session = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, decoded.session_id),
          isNull(sessions.revoked_at),
          gt(sessions.expires_at, new Date())
        )
      )
      .limit(1);
    
    if (!session) {
      return res.status(401).json({ error: 'Session expired' });
    }
    
    // Load user data from PostgreSQL
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user_id))
      .limit(1);
    
    const permissions = await getUserPermissions(session.user_id, session.tenant_id);
    
    req.user_id = session.user_id;
    req.tenant_id = session.tenant_id;
    req.permissions = permissions;
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
```

---

## Testing

### **Unit Tests (Mock Redis)**

```typescript
// __tests__/session.service.test.ts
import { SessionService } from '@/services/auth/session.service';
import RedisMock from 'ioredis-mock';

describe('SessionService', () => {
  let redis: RedisMock;
  let sessionService: SessionService;
  
  beforeEach(() => {
    redis = new RedisMock();
    sessionService = new SessionService(redis);
  });
  
  it('should create session in Redis', async () => {
    const session = await sessionService.createSession('user-id', 'tenant-id', {});
    
    const cached = await redis.get(`session:${session.session_id}`);
    expect(cached).toBeTruthy();
    expect(JSON.parse(cached!).user_id).toBe('user-id');
  });
  
  it('should expire session after TTL', async () => {
    const session = await sessionService.createSession('user-id', 'tenant-id', {});
    
    const ttl = await redis.ttl(`session:${session.session_id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(86400); // 24 hours
  });
});
```

### **Integration Tests (Real Redis)**

```typescript
// __tests__/integration/session.integration.test.ts
import Redis from 'ioredis';

describe('Session Integration', () => {
  let redis: Redis;
  
  beforeAll(() => {
    redis = new Redis({
      host: process.env.REDIS_TEST_HOST || 'localhost',
      port: parseInt(process.env.REDIS_TEST_PORT || '6379'),
      db: 15 // Use separate DB for tests
    });
  });
  
  afterAll(async () => {
    await redis.flushdb(); // Clean up test data
    await redis.quit();
  });
  
  it('should handle concurrent session creation', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      redis.setex(`session:test-${i}`, 60, JSON.stringify({ user_id: `user-${i}` }))
    );
    
    await Promise.all(promises);
    
    const keys = await redis.keys('session:test-*');
    expect(keys.length).toBe(100);
  });
});
```

---

## Migration from PostgreSQL Sessions

### **Phase 1: Dual Write (Week 1)**
- Write to both Redis and PostgreSQL
- Read from PostgreSQL (existing behavior)
- Monitor Redis performance

### **Phase 2: Dual Read (Week 2)**
- Write to both Redis and PostgreSQL
- Read from Redis first, fallback to PostgreSQL
- Monitor cache hit rate

### **Phase 3: Redis Primary (Week 3)**
- Write to Redis (synchronous), PostgreSQL (asynchronous)
- Read from Redis only
- PostgreSQL sessions table becomes audit-only

### **Phase 4: Cleanup (Week 4)**
- Remove PostgreSQL read fallback (optional)
- Optimize PostgreSQL sessions table for analytics
- Add cleanup job for old PostgreSQL sessions

---

## Summary

| Use Case | Redis Key Pattern | TTL | Fallback |
|----------|------------------|-----|----------|
| User sessions | `session:{session_id}` | 24h | PostgreSQL `sessions` table |
| Permission cache | `permissions:{user_id}:{tenant_id}` | 5min | PostgreSQL (roles/permissions) |
| Rate limiting | `rate_limit:{tenant_id}:{user_id}` | 1min | None (fail open) |
| JWT blacklist | `blacklist:{token_hash}` | Token expiry | PostgreSQL `sessions.revoked_at` |
| Approval queue | `approvals:{tenant_id}:{user_id}` | Manual | PostgreSQL `agent_approval_requests` |
| Notifications | `notifications:{tenant_id}:{user_id}` | Pub/Sub | WebSocket fallback |
| Tenant config | `tenant_config:{tenant_id}` | 15min | PostgreSQL `tenants` + related |

**Key Principle**: Redis is for **speed**, PostgreSQL is for **truth**.

