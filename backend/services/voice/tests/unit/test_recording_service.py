import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime
from src.services.recording_service import RecordingService
from src.models.recording import Recording, RecordingStatus
from src.utils.errors import RecordingNotFoundError

@pytest.fixture
def mock_repository():
    return AsyncMock()

@pytest.fixture
def mock_storage():
    return AsyncMock()

@pytest.fixture
def mock_cache():
    return AsyncMock()

@pytest.fixture
def recording_service(mock_repository, mock_storage, mock_cache):
    return RecordingService(
        repository=mock_repository,
        storage=mock_storage,
        cache=mock_cache
    )

@pytest.mark.unit
class TestRecordingService:
    async def test_create_recording_success(self, recording_service, mock_repository, mock_storage):
        # Arrange
        file_content = b"test audio content"
        file_metadata = {
            "filename": "test.wav",
            "content_type": "audio/wav",
            "user_id": "user123",
            "tenant_id": "tenant123"
        }
        
        mock_storage.upload_file.return_value = "storage_path/test.wav"
        mock_repository.create.return_value = Recording(
            id="rec123",
            user_id="user123",
            tenant_id="tenant123",
            filename="test.wav",
            storage_path="storage_path/test.wav",
            status=RecordingStatus.PENDING,
            created_at=datetime.utcnow()
        )

        # Act
        result = await recording_service.create_recording(file_content, file_metadata)

        # Assert
        assert result.id == "rec123"
        assert result.status == RecordingStatus.PENDING
        mock_storage.upload_file.assert_called_once_with(file_content, "test.wav")
        mock_repository.create.assert_called_once()

    async def test_get_recording_success(self, recording_service, mock_repository, mock_cache):
        # Arrange
        recording_id = "rec123"
        expected_recording = Recording(
            id=recording_id,
            user_id="user123",
            tenant_id="tenant123",
            filename="test.wav",
            storage_path="storage_path/test.wav",
            status=RecordingStatus.COMPLETED,
            created_at=datetime.utcnow()
        )
        
        # Simulate cache miss, repository hit
        mock_cache.get.return_value = None
        mock_repository.get_by_id.return_value = expected_recording

        # Act
        result = await recording_service.get_recording(recording_id)

        # Assert
        assert result == expected_recording
        mock_cache.get.assert_called_once_with(f"recording:{recording_id}")
        mock_repository.get_by_id.assert_called_once_with(recording_id)
        mock_cache.set.assert_called_once()

    async def test_get_recording_not_found(self, recording_service, mock_repository, mock_cache):
        # Arrange
        recording_id = "nonexistent"
        mock_cache.get.return_value = None
        mock_repository.get_by_id.return_value = None

        # Act & Assert
        with pytest.raises(RecordingNotFoundError):
            await recording_service.get_recording(recording_id)

    async def test_get_recording_from_cache(self, recording_service, mock_repository, mock_cache):
        # Arrange
        recording_id = "rec123"
        expected_recording = Recording(
            id=recording_id,
            user_id="user123",
            tenant_id="tenant123",
            filename="test.wav",
            storage_path="storage_path/test.wav",
            status=RecordingStatus.COMPLETED,
            created_at=datetime.utcnow()
        )
        
        # Simulate cache hit
        mock_cache.get.return_value = expected_recording.dict()

        # Act
        result = await recording_service.get_recording(recording_id)

        # Assert
        assert result.id == expected_recording.id
        mock_cache.get.assert_called_once_with(f"recording:{recording_id}")
        mock_repository.get_by_id.assert_not_called()
