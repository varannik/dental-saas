from fastapi import APIRouter, WebSocket, Depends, Query

from app.api.dependencies import get_session_manager, get_audio_processor, get_agent_graph
from app.services.websocket import handle_voice_stream
from app.services.session import SessionManager
from app.services.audio import AudioProcessor
from app.services.agent.graph import AgentGraph

router = APIRouter(prefix="/ws", tags=["websocket"])

@router.websocket("/voice")
async def voice_websocket(
    websocket: WebSocket,
    clinic_id: str = Query(...),
    source: str = Query(...),
    session_id: str = Query(None),
    session_manager: SessionManager = Depends(get_session_manager),
    audio_processor: AudioProcessor = Depends(get_audio_processor),
    agent_graph: AgentGraph = Depends(get_agent_graph)
):
    """
    WebSocket endpoint for real-time voice streaming
    
    Args:
        websocket: WebSocket connection
        clinic_id: ID of the clinic (as query parameter)
        source: Source of the interaction (reception, operatory, mobile) (as query parameter)
        session_id: Optional session ID for continuing a conversation (as query parameter)
    """
    await handle_voice_stream(
        websocket,
        clinic_id,
        source,
        session_id,
        session_manager,
        audio_processor,
        agent_graph
    ) 