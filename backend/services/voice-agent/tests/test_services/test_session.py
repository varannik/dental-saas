import pytest
from unittest.mock import patch, MagicMock

from app.services.session import SessionManager

def test_create_session(mock_redis_client):
    """
    Test the create_session method
    """
    # Create SessionManager with mock Redis client
    session_manager = SessionManager(mock_redis_client)
    
    # Test session creation
    with patch("uuid.uuid4", return_value="test-session-id"):
        session_id = session_manager.create_session("test-clinic", "reception")
        
        # Verify result
        assert session_id == "test-session-id"
        mock_redis_client.hset.assert_called_once()
        mock_redis_client.expire.assert_called_once()

def test_update_session(mock_redis_client):
    """
    Test the update_session method
    """
    # Create SessionManager with mock Redis client
    session_manager = SessionManager(mock_redis_client)
    
    # Test session update
    result = session_manager.update_session("test-session-id", "test transcript", "test response")
    
    # Verify result
    assert result is True
    mock_redis_client.exists.assert_called_once_with("voice_session:test-session-id")
    mock_redis_client.hget.assert_called_once()
    mock_redis_client.hset.assert_called_once()
    mock_redis_client.expire.assert_called_once()

def test_update_session_nonexistent(mock_redis_client):
    """
    Test the update_session method with a nonexistent session
    """
    # Create SessionManager with mock Redis client
    mock_redis_client.exists.return_value = False
    session_manager = SessionManager(mock_redis_client)
    
    # Test session update
    result = session_manager.update_session("nonexistent-session", "test transcript", "test response")
    
    # Verify result
    assert result is False
    mock_redis_client.exists.assert_called_once_with("voice_session:nonexistent-session")
    mock_redis_client.hget.assert_not_called()
    mock_redis_client.hset.assert_not_called()
    mock_redis_client.expire.assert_not_called()

def test_get_session_history(mock_redis_client):
    """
    Test the get_session_history method
    """
    # Create SessionManager with mock Redis client
    session_manager = SessionManager(mock_redis_client)
    
    # Test getting session history
    history = session_manager.get_session_history("test-session-id")
    
    # Verify result
    assert len(history) == 1
    assert history[0]["transcript"] == "test"
    assert history[0]["response"] == "test response"
    mock_redis_client.exists.assert_called_once_with("voice_session:test-session-id")
    mock_redis_client.hgetall.assert_called_once_with("voice_session:test-session-id")

def test_get_session_history_nonexistent(mock_redis_client):
    """
    Test the get_session_history method with a nonexistent session
    """
    # Create SessionManager with mock Redis client
    mock_redis_client.exists.return_value = False
    session_manager = SessionManager(mock_redis_client)
    
    # Test getting session history
    history = session_manager.get_session_history("nonexistent-session")
    
    # Verify result
    assert history == []
    mock_redis_client.exists.assert_called_once_with("voice_session:nonexistent-session")
    mock_redis_client.hgetall.assert_not_called() 