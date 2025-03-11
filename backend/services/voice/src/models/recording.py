from enum import Enum
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class RecordingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class Recording(BaseModel):
    id: str = Field(..., description="Unique identifier for the recording")
    user_id: str = Field(..., description="ID of the user who created the recording")
    tenant_id: str = Field(..., description="ID of the tenant this recording belongs to")
    filename: str = Field(..., description="Original filename of the recording")
    storage_path: str = Field(..., description="Path where the file is stored")
    status: RecordingStatus = Field(default=RecordingStatus.PENDING, description="Current status of the recording")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when the recording was created")
    updated_at: Optional[datetime] = Field(None, description="Timestamp when the recording was last updated")
    transcription: Optional[str] = Field(None, description="Transcribed text from the recording")
    medical_terms: Optional[list[str]] = Field(default_factory=list, description="Extracted medical terms from transcription")
    error_message: Optional[str] = Field(None, description="Error message if processing failed")

    class Config:
        use_enum_values = True
