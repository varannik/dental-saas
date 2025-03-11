import redis
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.models.user import User
from app.services.session import SessionManager
from app.services.audio import AudioProcessor
from app.services.agent.graph import AgentGraph

# Authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Redis client
def get_redis_client():
    """
    Get Redis client for session management and queue
    """
    client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=settings.REDIS_DB,
        decode_responses=True
    )
    try:
        yield client
    finally:
        client.close()

# Session manager
def get_session_manager(redis_client: redis.Redis = Depends(get_redis_client)):
    """
    Get session manager instance
    """
    return SessionManager(redis_client)

# Audio processor
def get_audio_processor():
    """
    Get audio processor instance
    """
    return AudioProcessor()

# Agent graph
def get_agent_graph():
    """
    Get agent graph instance
    """
    return AgentGraph()

# Authentication middleware
async def verify_token(token: str = Depends(oauth2_scheme)):
    """
    Verify JWT token with auth service
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{settings.AUTH_SERVICE_URL}/verify-token",
                json={"token": token}
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return response.json()
        except httpx.RequestError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable",
            )

async def get_current_user(user_data: dict = Depends(verify_token)):
    """
    Get current authenticated user
    """
    return User(
        username=user_data["username"],
        email=user_data.get("email"),
        full_name=user_data.get("full_name"),
        role=user_data["role"]
    ) 