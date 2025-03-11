from typing import Optional, List, Dict
from pydantic import BaseModel

class VoiceCommandRequest(BaseModel):
    """
    Request model for voice command processing
    """
    clinic_id: str
    source: str  # "reception", "operatory", "mobile"
    session_id: Optional[str] = None

class VoiceCommandResponse(BaseModel):
    """
    Response model for voice command processing
    """
    session_id: str
    transcript: str
    response_text: str
    response_audio_url: str
    suggested_actions: Optional[List[Dict]] = None

class VoiceTask(BaseModel):
    """
    Model for voice processing tasks in the queue
    """
    task_id: str
    type: str = "voice_processing"
    data: Dict
    status: str = "pending"
    created_at: str
    created_by: str 