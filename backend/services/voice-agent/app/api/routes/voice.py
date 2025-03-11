import os
import uuid
from typing import Dict, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.models.user import User
from app.models.voice import VoiceCommandRequest, VoiceCommandResponse, VoiceTask
from app.services.session import SessionManager
from app.services.audio import AudioProcessor
from app.services.agent.graph import AgentGraph
from app.api.dependencies import get_current_user, get_session_manager, get_audio_processor, get_agent_graph, get_redis_client

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/upload", response_model=VoiceCommandResponse)
async def upload_voice_command(
    background_tasks: BackgroundTasks,
    request: VoiceCommandRequest,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session_manager: SessionManager = Depends(get_session_manager),
    audio_processor: AudioProcessor = Depends(get_audio_processor),
    agent_graph: AgentGraph = Depends(get_agent_graph)
):
    """
    Process uploaded voice command and return response
    """
    # Create session or use existing
    session_id = request.session_id or session_manager.create_session(
        request.clinic_id, request.source
    )
    
    # Save uploaded file
    temp_file_path = os.path.join(settings.UPLOAD_DIR, f"audio_{uuid.uuid4()}.wav")
    
    with open(temp_file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    # Process audio to text
    transcript = await audio_processor.transcribe_audio(temp_file_path)
    
    # Generate text response from agent
    messages = [{"role": "user", "content": transcript}]
    response_text = await agent_graph.invoke(messages, session_id)
    
    # Update session with this interaction
    session_manager.update_session(session_id, transcript, response_text)
    
    # Generate audio response
    _, audio_url = await audio_processor.generate_audio(response_text)
    
    # Clean up the uploaded file
    background_tasks.add_task(os.remove, temp_file_path)
    
    # Parse response for potential suggested actions
    suggested_actions = []
    if "appointment" in response_text.lower():
        suggested_actions.append({
            "action": "view_calendar",
            "label": "Open Calendar"
        })
    if "patient" in response_text.lower() and "information" in response_text.lower():
        suggested_actions.append({
            "action": "search_patient",
            "label": "Search Patient"
        })
    
    return VoiceCommandResponse(
        session_id=session_id,
        transcript=transcript,
        response_text=response_text,
        response_audio_url=audio_url,
        suggested_actions=suggested_actions
    )

@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    session_manager: SessionManager = Depends(get_session_manager)
):
    """
    Get session history
    """
    history = session_manager.get_session_history(session_id)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return {
        "session_id": session_id,
        "history": history
    }

@router.post("/queue")
async def queue_voice_task(
    task: Dict,
    current_user: User = Depends(get_current_user),
    redis_client = Depends(get_redis_client)
):
    """
    Queue a voice processing task
    """
    task_id = str(uuid.uuid4())
    task_data = {
        "id": task_id,
        "type": "voice_processing",
        "data": task,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "created_by": current_user.username
    }
    
    # Add to Redis Stream
    redis_client.xadd(
        "voice_processing_queue",
        task_data
    )
    
    return {"task_id": task_id, "status": "queued"} 