import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.mark.asyncio
@patch("app.api.routes.websocket.handle_voice_stream")
async def test_websocket_endpoint(mock_handle_voice_stream, client):
    """
    Test that the WebSocket endpoint is properly configured
    """
    # Set up the mock to do nothing
    mock_handle_voice_stream.return_value = None
    
    # Connect to the WebSocket
    with client.websocket_connect("/ws/voice/test-clinic/reception") as websocket:
        # Since we've mocked the handler, we don't need to send/receive anything
        pass
    
    # Verify the handler was called with the correct parameters
    mock_handle_voice_stream.assert_called_once()
    call_args = mock_handle_voice_stream.call_args[1]
    
    assert "websocket" in call_args
    assert call_args["clinic_id"] == "test-clinic"
    assert call_args["source"] == "reception"
    assert call_args["session_id"] is None

@pytest.mark.asyncio
@patch("app.api.routes.websocket.handle_voice_stream")
async def test_websocket_with_session_id(mock_handle_voice_stream, client):
    """
    Test WebSocket endpoint with a session ID
    """
    # Set up the mock to do nothing
    mock_handle_voice_stream.return_value = None
    
    # Connect to the WebSocket with a session ID
    with client.websocket_connect("/ws/voice/test-clinic/reception?session_id=test-session") as websocket:
        # Since we've mocked the handler, we don't need to send/receive anything
        pass
    
    # Verify the handler was called with the correct parameters
    mock_handle_voice_stream.assert_called_once()
    call_args = mock_handle_voice_stream.call_args[1]
    
    assert "websocket" in call_args
    assert call_args["clinic_id"] == "test-clinic"
    assert call_args["source"] == "reception"
    assert call_args["session_id"] == "test-session" 