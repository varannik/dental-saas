import os
from typing import Optional, Dict, Any, List
from pydantic import Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """
    Application settings using pydantic for environment variable validation
    """
    # API settings
    APP_TITLE: str = "Dental Clinic Voice-Enabled AI Agent API"
    API_V1_STR: str = "/api/v1"
    
    # CORS settings
    CORS_ORIGINS: List[str] = ["*"]
    
    # Redis settings
    REDIS_HOST: str = Field(default="localhost")
    REDIS_PORT: int = Field(default=6379)
    REDIS_DB: int = Field(default=0)
    
    # Authentication settings
    AUTH_SERVICE_URL: str = Field(default="http://auth-service:8080")
    
    # Model settings
    WHISPER_MODEL: str = Field(default="base")
    
    # OpenAI settings
    OPENAI_API_KEY: str = Field(default="your-openai-api-key")
    OPENAI_MODEL: str = Field(default="gpt-4")
    
    # ElevenLabs settings
    ELEVENLABS_API_KEY: str = Field(default="your-elevenlabs-api-key")
    ELEVENLABS_VOICE_ID: str = Field(default="default-voice-id")
    ELEVENLABS_MODEL: str = Field(default="eleven_monolingual_v1")
    
    # File storage settings
    UPLOAD_DIR: str = Field(default="./uploads")
    AUDIO_RESPONSE_DIR: str = Field(default="./audio_responses")
    
    # Session settings
    SESSION_EXPIRY_SECONDS: int = Field(default=3600)  # 1 hour
    
    class Config:
        env_file = ".env"
        case_sensitive = True

# Create settings instance
settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.AUDIO_RESPONSE_DIR, exist_ok=True) 