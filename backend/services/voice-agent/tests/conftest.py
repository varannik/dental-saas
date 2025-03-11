import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.session import SessionManager
from app.services.audio import AudioProcessor
from app.services.agent.graph import AgentGraph
from app.services.agent.tools import DentalTools

@pytest.fixture
def test_client():
    """
    Create a test client for FastAPI
    """
    return TestClient(app)

@pytest.fixture
def mock_redis_client():
    """
    Mock Redis client for testing
    """
    redis_client = MagicMock()
    redis_client.hset = MagicMock()
    redis_client.hget = MagicMock(return_value="0")
    redis_client.expire = MagicMock()
    redis_client.exists = MagicMock(return_value=True)
    redis_client.hgetall = MagicMock(return_value={"interaction_count": "1", "transcript:0": "test", "response:0": "test response"})
    redis_client.xadd = MagicMock()
    redis_client.xgroup_create = MagicMock()
    redis_client.xreadgroup = MagicMock(return_value=[])
    redis_client.xack = MagicMock()
    return redis_client

@pytest.fixture
def mock_session_manager(mock_redis_client):
    """
    Mock session manager for testing
    """
    session_manager = SessionManager(mock_redis_client)
    session_manager.create_session = MagicMock(return_value="test-session-id")
    session_manager.update_session = MagicMock(return_value=True)
    session_manager.get_session_history = MagicMock(return_value=[
        {"transcript": "test question", "response": "test answer"}
    ])
    return session_manager

@pytest.fixture
def mock_audio_processor():
    """
    Mock audio processor for testing
    """
    audio_processor = MagicMock()
    audio_processor.transcribe_audio = AsyncMock(return_value="What appointments do I have today?")
    audio_processor.generate_audio = AsyncMock(return_value=("file_path.mp3", "/audio_responses/file_path.mp3"))
    return audio_processor

@pytest.fixture
def mock_agent_graph():
    """
    Mock agent graph for testing
    """
    agent_graph = MagicMock()
    agent_graph.invoke = AsyncMock(return_value="You have a cleaning appointment at 2:00 PM today.")
    return agent_graph

@pytest.fixture
def mock_dental_tools():
    """
    Mock dental tools for testing
    """
    dental_tools = DentalTools()
    dental_tools.get_patient_info = AsyncMock()
    dental_tools.get_available_slots = AsyncMock()
    dental_tools.schedule_appointment = AsyncMock()
    dental_tools.get_treatment_history = AsyncMock()
    return dental_tools

@pytest.fixture
def mock_current_user():
    """
    Mock current user for testing
    """
    return {
        "username": "testuser",
        "email": "test@example.com",
        "full_name": "Test User",
        "role": "staff"
    } 