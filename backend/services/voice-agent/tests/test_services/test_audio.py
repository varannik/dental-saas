import pytest
import os
from unittest.mock import patch, MagicMock, AsyncMock

from app.services.audio import AudioProcessor

@pytest.mark.asyncio
async def test_transcribe_audio():
    """
    Test the transcribe_audio method
    """
    # Mock the Whisper model
    mock_whisper_model = MagicMock()
    mock_whisper_model.transcribe.return_value = {"text": "Hello, this is a test"}
    
    # Create AudioProcessor with mocked Whisper model
    with patch("whisper.load_model", return_value=mock_whisper_model):
        audio_processor = AudioProcessor()
        
        # Test transcription
        result = await audio_processor.transcribe_audio("test_file.wav")
        
        # Verify result
        assert result == "Hello, this is a test"
        mock_whisper_model.transcribe.assert_called_once_with("test_file.wav")

@pytest.mark.asyncio
async def test_generate_audio():
    """
    Test the generate_audio method
    """
    # Mock ElevenLabs
    mock_audio_data = b"test audio data"
    
    with patch("elevenlabs.generate", return_value=mock_audio_data), \
         patch("os.path.join", return_value="test_path.mp3"), \
         patch("builtins.open", MagicMock()), \
         patch("uuid.uuid4", return_value="test-uuid"):
        
        # Create AudioProcessor
        audio_processor = AudioProcessor()
        
        # Test audio generation
        file_path, url = await audio_processor.generate_audio("Hello, this is a test")
        
        # Verify result
        assert file_path == "test_path.mp3"
        assert url == "/audio_responses/response_test-uuid.mp3" 