import json
from typing import Any, Optional
from redis.asyncio import Redis
from src.utils.errors import VoiceServiceError

class RedisCache:
    def __init__(self, redis_client: Redis):
        self.redis = redis_client

    async def get(self, key: str) -> Optional[dict]:
        """Get a value from cache."""
        try:
            value = await self.redis.get(key)
            return json.loads(value) if value else None
        except Exception as e:
            raise VoiceServiceError(f"Redis get error: {str(e)}")

    async def set(self, key: str, value: Any, expire: int = 3600) -> None:
        """Set a value in cache with expiration."""
        try:
            await self.redis.set(
                key,
                json.dumps(value),
                ex=expire
            )
        except Exception as e:
            raise VoiceServiceError(f"Redis set error: {str(e)}")

    async def delete(self, key: str) -> None:
        """Delete a value from cache."""
        try:
            await self.redis.delete(key)
        except Exception as e:
            raise VoiceServiceError(f"Redis delete error: {str(e)}")

    async def publish(self, channel: str, message: Any) -> None:
        """Publish a message to a channel."""
        try:
            await self.redis.publish(
                channel,
                json.dumps(message)
            )
        except Exception as e:
            raise VoiceServiceError(f"Redis publish error: {str(e)}")

    async def subscribe(self, channel: str):
        """Subscribe to a channel and yield messages."""
        try:
            pubsub = self.redis.pubsub()
            await pubsub.subscribe(channel)
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True)
                if message:
                    yield json.loads(message["data"])
        except Exception as e:
            raise VoiceServiceError(f"Redis subscribe error: {str(e)}")
        finally:
            await pubsub.unsubscribe(channel)

    async def increment_rate_limit(self, key: str, window: int = 60) -> int:
        """Increment rate limit counter and return current count."""
        try:
            pipe = self.redis.pipeline()
            await pipe.incr(key)
            await pipe.expire(key, window)
            result = await pipe.execute()
            return result[0]
        except Exception as e:
            raise VoiceServiceError(f"Redis rate limit error: {str(e)}")

    async def clear_rate_limit(self, key: str) -> None:
        """Clear rate limit counter."""
        await self.delete(key)
