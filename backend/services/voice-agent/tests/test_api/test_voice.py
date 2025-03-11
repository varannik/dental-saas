import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.voice import router
from app.models.voice import VoiceCommandRequest, VoiceCommandResponse

# Create a test FastAPI app with just the voice router
test_app = FastAPI()
test_app.include_router(router)

@pytest.mark.asyncio
async def test_upload_voice_command(
    mock_session_manager,
    mock_audio_processor,
    mock_agent_graph,
    mock_current_user
):
    """
    Test the upload voice command endpoint
    """
    with patch("app.api.routes.voice.get_current_user", return_value=mock_current_user), \
         patch("app.api.routes.voice.get_session_manager", return_value=mock_session_manager), \
         patch("app.api.routes.voice.get_audio_processor", return_value=mock_audio_processor), \
         patch("app.api.routes.voice.get_agent_graph", return_value=mock_agent_graph), \
         patch("builtins.open", MagicMock()), \
         patch("os.remove", MagicMock()):
        
        client = TestClient(test_app)
        
        # Create test file
        test_file = MagicMock()
        test_file.read = AsyncMock(return_value=b"test audio data")
        
        # Create test request
        request_data = {
            "clinic_id": "test-clinic",
            "source": "reception"
        }
        
        # Make request
        response = client.post(
            "/voice/upload",
            data=request_data,
            files={"file": ("test.wav", test_file, "audio/wav")}
        )
        
        # Check response
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "test-session-id"
        assert data["transcript"] == "What appointments do I have today?"
        assert data["response_text"] == "You have a cleaning appointment at 2:00 PM today."
        assert data["response_audio_url"] == "/audio_responses/file_path.mp3"
        
        # Verify mocks were called
        mock_session_manager.create_session.assert_called_once()
        mock_audio_processor.transcribe_audio.assert_called_once()
        mock_agent_graph.invoke.assert_called_once()
        mock_session_manager.update_session.assert_called_once()
        mock_audio_processor.generate_audio.assert_called_once()

@pytest.mark.asyncio
async def test_get_session(
    mock_session_manager,
    mock_current_user
):
    """
    Test the get session endpoint
    """
    with patch("app.api.routes.voice.get_current_user", return_value=mock_current_user), \
         patch("app.api.routes.voice.get_session_manager", return_value=mock_session_manager):
        
        client = TestClient(test_app)
        
        # Make request
        response = client.get("/voice/sessions/test-session-id")
        
        # Check response
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "test-session-id"
        assert len(data["history"]) == 1
        assert data["history"][0]["transcript"] == "test question"
        assert data["history"][0]["response"] == "test answer"
        
        # Verify mocks were called
        mock_session_manager.get_session_history.assert_called_once_with("test-session-id")

@pytest.mark.asyncio
async def test_queue_voice_task(
    mock_redis_client,
    mock_current_user
):
    """
    Test the queue voice task endpoint
    """
    with patch("app.api.routes.voice.get_current_user", return_value=mock_current_user), \
         patch("app.api.routes.voice.get_redis_client", return_value=mock_redis_client), \
         patch("uuid.uuid4", return_value="test-task-id"):
        
        client = TestClient(test_app)
        
        # Create test task
        task_data = {
            "action": "process_voice",
            "data": "test data"
        }
        
        # Make request
        response = client.post(
            "/voice/queue",
            json=task_data
        )
        
        # Check response
        assert response.status_code == 200
        data = response.json()
        assert data["task_id"] == "test-task-id"
        assert data["status"] == "queued"
        
        # Verify mocks were called
        mock_redis_client.xadd.assert_called_once() 