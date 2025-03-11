class VoiceServiceError(Exception):
    """Base exception for voice service errors."""
    pass

class RecordingNotFoundError(VoiceServiceError):
    """Raised when a recording is not found."""
    def __init__(self, recording_id: str):
        self.recording_id = recording_id
        super().__init__(f"Recording with ID {recording_id} not found")

class StorageError(VoiceServiceError):
    """Raised when there's an error with file storage operations."""
    pass

class TranscriptionError(VoiceServiceError):
    """Raised when there's an error during transcription."""
    pass

class ValidationError(VoiceServiceError):
    """Raised when input validation fails."""
    pass

class RateLimitExceededError(VoiceServiceError):
    """Raised when rate limit is exceeded."""
    pass
