import os
import uuid
import json
import asyncio
from tempfile import NamedTemporaryFile
from typing import Dict, List, Optional

from fastapi import WebSocket, WebSocketDisconnect, Depends
from fastapi.websockets import WebSocketState

from app.core.config import settings
from app.models.user import User
from app.services.session import SessionManager
from app.services.audio import AudioProcessor
from app.services.agent.graph import AgentGraph
from app.api.dependencies import get_session_manager, get_audio_processor, get_agent_graph

# Store active connections
active_connections: Dict[str, WebSocket] = {}

class ConnectionManager:
    """
    Manager for WebSocket connections
    """
    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept connection and store it"""
        await websocket.accept()
        active_connections[client_id] = websocket
        print(f"Client connected: {client_id}")
    
    def disconnect(self, client_id: str):
        """Remove connection"""
        if client_id in active_connections:
            del active_connections[client_id]
            print(f"Client disconnected: {client_id}")
    
    async def send_message(self, client_id: str, message: Dict):
        """Send message to specific client"""
        if client_id in active_connections:
            websocket = active_connections[client_id]
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json(message)

# Initialize connection manager
connection_manager = ConnectionManager()

async def handle_voice_stream(
    websocket: WebSocket,
    clinic_id: str,
    source: str,
    session_id: Optional[str] = None,
    session_manager: Optional[SessionManager] = None,
    audio_processor: Optional[AudioProcessor] = None,
    agent_graph: Optional[AgentGraph] = None
):
    """
    Handle voice streaming from a client
    
    Args:
        websocket: WebSocket connection
        clinic_id: ID of the clinic
        source: Source of the interaction (reception, operatory, mobile)
        session_id: Optional session ID for continuing a conversation
        session_manager: Session manager service
        audio_processor: Audio processing service
        agent_graph: LangGraph agent service
    """
    # Generate client ID
    client_id = str(uuid.uuid4())
    
    # Create session if not provided
    if not session_id and session_manager:
        session_id = session_manager.create_session(clinic_id, source)
    
    # Connect client
    await connection_manager.connect(websocket, client_id)
    
    try:
        # Send session info to client
        await websocket.send_json({
            "type": "connection_established",
            "session_id": session_id
        })
        
        # Process incoming audio data
        while True:
            # Wait for audio data from client
            data = await websocket.receive_bytes()
            
            # Save audio to temporary file
            with NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                tmp_file.write(data)
                tmp_file_path = tmp_file.name
            
            try:
                # Process audio to text
                if audio_processor:
                    transcript = await audio_processor.transcribe_audio(tmp_file_path)
                else:
                    transcript = "Audio processor not available"
                
                # Send transcript to client
                await websocket.send_json({
                    "type": "transcript",
                    "text": transcript
                })
                
                # Generate response from agent
                if agent_graph:
                    messages = [{"role": "user", "content": transcript}]
                    response_text = await agent_graph.invoke(messages, session_id)
                else:
                    response_text = "Agent not available"
                
                # Update session with this interaction
                if session_manager and session_id:
                    session_manager.update_session(session_id, transcript, response_text)
                
                # Generate audio response
                audio_url = ""
                if audio_processor:
                    _, audio_url = await audio_processor.generate_audio(response_text)
                
                # Send complete response to client
                await websocket.send_json({
                    "type": "response",
                    "transcript": transcript,
                    "response_text": response_text,
                    "response_audio_url": audio_url,
                    "session_id": session_id
                })
                
            finally:
                # Clean up temporary file
                if os.path.exists(tmp_file_path):
                    os.remove(tmp_file_path)
                    
    except WebSocketDisconnect:
        # Handle client disconnect
        connection_manager.disconnect(client_id)
    except Exception as e:
        # Send error to client
        if client_id in active_connections:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        connection_manager.disconnect(client_id)
        # In production, log this error
        print(f"Error in WebSocket handler: {e}") 