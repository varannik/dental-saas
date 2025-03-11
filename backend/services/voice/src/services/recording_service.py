from datetime import datetime
from typing import Optional, Dict, Any
from src.models.recording import Recording, RecordingStatus
from src.utils.errors import RecordingNotFoundError

class RecordingService:
    def __init__(self, repository, storage, cache):
        self.repository = repository
        self.storage = storage
        self.cache = cache

    async def create_recording(self, file_content: bytes, metadata: Dict[str, Any]) -> Recording:
        """Create a new voice recording."""
        # Upload file to storage
        storage_path = await self.storage.upload_file(file_content, metadata["filename"])

        # Create recording document
        recording = Recording(
            id=self.repository.generate_id(),  # Assuming repository has this method
            user_id=metadata["user_id"],
            tenant_id=metadata["tenant_id"],
            filename=metadata["filename"],
            storage_path=storage_path,
            status=RecordingStatus.PENDING
        )

        # Save to database
        saved_recording = await self.repository.create(recording)

        # Queue for processing
        await self.cache.publish("recording_queue", saved_recording.id)

        return saved_recording

    async def get_recording(self, recording_id: str) -> Recording:
        """Get a recording by ID, with caching."""
        # Try cache first
        cached_data = await self.cache.get(f"recording:{recording_id}")
        if cached_data:
            return Recording(**cached_data)

        # If not in cache, get from repository
        recording = await self.repository.get_by_id(recording_id)
        if not recording:
            raise RecordingNotFoundError(recording_id)

        # Cache the result
        await self.cache.set(
            f"recording:{recording_id}",
            recording.dict(),
            expire=3600  # Cache for 1 hour
        )

        return recording

    async def update_recording_status(
        self,
        recording_id: str,
        status: RecordingStatus,
        transcription: Optional[str] = None,
        medical_terms: Optional[list[str]] = None,
        error_message: Optional[str] = None
    ) -> Recording:
        """Update recording status and related fields."""
        recording = await self.get_recording(recording_id)
        
        recording.status = status
        recording.updated_at = datetime.utcnow()
        
        if transcription is not None:
            recording.transcription = transcription
        
        if medical_terms is not None:
            recording.medical_terms = medical_terms
            
        if error_message is not None:
            recording.error_message = error_message

        # Update in repository
        updated_recording = await self.repository.update(recording)
        
        # Update cache
        await self.cache.set(
            f"recording:{recording_id}",
            updated_recording.dict(),
            expire=3600
        )

        return updated_recording

    async def list_recordings(
        self,
        tenant_id: str,
        user_id: Optional[str] = None,
        status: Optional[RecordingStatus] = None,
        limit: int = 10,
        offset: int = 0
    ) -> list[Recording]:
        """List recordings with optional filters."""
        filters = {"tenant_id": tenant_id}
        if user_id:
            filters["user_id"] = user_id
        if status:
            filters["status"] = status

        return await self.repository.list(filters, limit, offset)
