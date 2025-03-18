from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
import redis

from app.api.dependencies import get_redis_client

router = APIRouter(tags=["health"])

@router.get("/health")
async def health_check():
    """
    Health check endpoint for service monitoring
    """
    return {
        "status": "ok", 
        "service": "voice-agent",
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/health/redis")
async def redis_health_check(redis_client: redis.Redis = Depends(get_redis_client)):
    """
    Health check endpoint specifically for Redis connection
    """
    try:
        # Perform a simple ping operation to verify Redis connection
        ping_result = redis_client.ping()
        
        # Check if a key can be set and retrieved
        test_key = "health_check_test"
        test_value = datetime.utcnow().isoformat()
        
        redis_client.set(test_key, test_value, ex=10)  # Set with 10 second expiry
        retrieved_value = redis_client.get(test_key)
        
        if retrieved_value and retrieved_value.decode() == test_value:
            return {
                "status": "ok",
                "service": "redis",
                "ping": ping_result,
                "read_write_test": "passed",
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Redis read/write test failed"
            )
            
    except redis.exceptions.ConnectionError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Redis connection error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Redis health check failed: {str(e)}"
        ) 