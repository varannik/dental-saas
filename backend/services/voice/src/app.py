import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from motor.motor_asyncio import AsyncIOMotorClient
from minio import Minio
from src.api.routes import router as voice_router
from src.middleware.rate_limit import RateLimitMiddleware
from src.cache.redis_cache import RedisCache
from src.services.recording_service import RecordingService

# Load environment variables
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
MINIO_URL = os.getenv("MINIO_URL", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "recordings")

# Create FastAPI app
app = FastAPI(
    title="Voice Processing Service",
    description="Service for managing voice recordings and transcriptions",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    # Initialize Redis
    app.state.redis = Redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    app.state.cache = RedisCache(app.state.redis)

    # Initialize MongoDB
    app.state.mongodb = AsyncIOMotorClient(MONGODB_URL)
    app.state.db = app.state.mongodb.voice_service

    # Initialize MinIO
    app.state.minio = Minio(
        MINIO_URL,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False  # Set to True in production with proper SSL
    )

    # Ensure MinIO bucket exists
    if not app.state.minio.bucket_exists(MINIO_BUCKET):
        app.state.minio.make_bucket(MINIO_BUCKET)

    # Add rate limiting middleware
    app.add_middleware(
        RateLimitMiddleware,
        redis_cache=app.state.cache,
        requests_per_minute=60
    )

@app.on_event("shutdown")
async def shutdown_event():
    # Close connections
    await app.state.redis.close()
    app.state.mongodb.close()

# Include routers
app.include_router(voice_router)

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}
