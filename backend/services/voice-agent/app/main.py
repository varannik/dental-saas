import asyncio
from typing import Optional
from fastapi import FastAPI, WebSocket, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.api.routes import voice, health
from app.api.routes.websocket import handle_voice_stream
from app.workers.voice_processor import create_voice_processor_worker
from app.api.dependencies import get_redis_client, get_session_manager, get_audio_processor, get_agent_graph

# Create FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for audio responses
app.mount("/audio_responses", StaticFiles(directory=settings.AUDIO_RESPONSE_DIR), name="audio_responses")

# Include routers
app.include_router(health.router)
app.include_router(voice.router, prefix=settings.API_V1_STR)

# WebSocket endpoint for voice streaming
@app.websocket("/ws/voice/{clinic_id}/{source}")
async def websocket_endpoint(
    websocket: WebSocket,
    clinic_id: str,
    source: str,
    session_id: Optional[str] = Query(None),
    session_manager = Depends(get_session_manager),
    audio_processor = Depends(get_audio_processor),
    agent_graph = Depends(get_agent_graph)
):
    """
    WebSocket endpoint for real-time voice streaming
    
    Args:
        websocket: WebSocket connection
        clinic_id: ID of the clinic
        source: Source of the interaction (reception, operatory, mobile)
        session_id: Optional session ID for continuing a conversation
    """
    await handle_voice_stream(
        websocket=websocket,
        clinic_id=clinic_id,
        source=source,
        session_id=session_id,
        session_manager=session_manager,
        audio_processor=audio_processor,
        agent_graph=agent_graph
    )

# Background worker task
@app.on_event("startup")
async def startup_event():
    """
    Start background worker on app startup
    """
    # Get Redis client
    redis_client = next(get_redis_client())
    
    # Create and start voice processor worker
    worker = create_voice_processor_worker(redis_client)
    asyncio.create_task(worker.run())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True) 