from fastapi import Request, HTTPException
from src.cache.redis_cache import RedisCache
from src.utils.errors import RateLimitExceededError

class RateLimitMiddleware:
    def __init__(self, redis_cache: RedisCache, requests_per_minute: int = 60):
        self.cache = redis_cache
        self.requests_per_minute = requests_per_minute

    async def __call__(self, request: Request, call_next):
        # Get client identifier (IP or user ID if authenticated)
        client_id = request.client.host
        if "user_id" in request.session:
            client_id = request.session["user_id"]

        # Create rate limit key
        rate_limit_key = f"rate_limit:{client_id}:{request.url.path}"

        # Check and increment rate limit
        try:
            current_count = await self.cache.increment_rate_limit(rate_limit_key)
            if current_count > self.requests_per_minute:
                raise RateLimitExceededError("Rate limit exceeded")

            # Add rate limit headers
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
            response.headers["X-RateLimit-Remaining"] = str(
                max(0, self.requests_per_minute - current_count)
            )
            return response

        except RateLimitExceededError:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again later."
            )
