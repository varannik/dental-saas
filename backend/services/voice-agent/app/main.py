import asyncio
from typing import Optional
from fastapi import FastAPI, WebSocket, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.api.routes import voice, health, websocket_routes
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
app.include_router(websocket_routes.router)

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