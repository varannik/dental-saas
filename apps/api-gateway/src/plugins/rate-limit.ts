import { Redis } from 'ioredis';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    rateLimitGuard: (args: {
      tenantId?: string;
      userId?: string;
      endpoint: string;
      role?: 'public' | 'authenticated' | 'admin';
    }) => Promise<void>;
  }
}

function getRedisClient(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

function getLimit(role: 'public' | 'authenticated' | 'admin'): number {
  if (role === 'admin') return 5000;
  if (role === 'authenticated') return 1000;
  return 100;
}

function getRateLimitWindowSeconds(): number {
  return 60;
}

function getRateLimitKey(args: { tenantId?: string; userId?: string; endpoint: string }): string {
  return `dental:ratelimit:${args.tenantId ?? 'public'}:${args.userId ?? 'anon'}:${args.endpoint}`;
}

const rateLimitPluginImpl: FastifyPluginAsync = async (app): Promise<void> => {
  const redis = getRedisClient();

  app.decorate('rateLimitGuard', async (args) => {
    const key = getRateLimitKey(args);
    const limit = getLimit(args.role ?? 'public');
    const windowSeconds = getRateLimitWindowSeconds();
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (current > limit) {
        const error = new Error('Rate limit exceeded.');
        (error as Error & { statusCode?: number }).statusCode = 429;
        throw error;
      }
    } catch (error) {
      if ((error as Error & { statusCode?: number }).statusCode === 429) {
        throw error;
      }
      app.log.warn({ error }, 'Rate-limit backend unavailable, skipping enforcement');
    }
  });

  app.addHook('onClose', async () => {
    redis.disconnect();
  });
};

export const rateLimitPlugin = fp(rateLimitPluginImpl, {
  name: 'gateway-rate-limit-plugin',
});
