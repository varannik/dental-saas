from datetime import datetime
from fastapi import APIRouter

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