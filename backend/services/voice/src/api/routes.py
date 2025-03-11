from fastapi import APIRouter, UploadFile, Depends, HTTPException, status
from typing import List, Optional
from src.services.recording_service import RecordingService
from src.models.recording import Recording, RecordingStatus
from src.utils.errors import RecordingNotFoundError, VoiceServiceError

router = APIRouter(prefix="/api/voice", tags=["voice"])

async def get_recording_service() -> RecordingService:
    """Dependency to get recording service instance."""
    # This would be properly initialized with actual dependencies
    raise NotImplementedError("Service initialization not implemented")

@router.post("/recordings", response_model=Recording, status_code=status.HTTP_201_CREATED)
async def create_recording(
    file: UploadFile,
    user_id: str,
    tenant_id: str,
    service: RecordingService = Depends(get_recording_service)
):
    """
    Create a new voice recording.
    """
    try:
        file_content = await file.read()
        metadata = {
            "filename": file.filename,
            "content_type": file.content_type,
            "user_id": user_id,
            "tenant_id": tenant_id
        }
        return await service.create_recording(file_content, metadata)
    except VoiceServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/recordings/{recording_id}", response_model=Recording)
async def get_recording(
    recording_id: str,
    service: RecordingService = Depends(get_recording_service)
):
    """
    Get a voice recording by ID.
    """
    try:
        return await service.get_recording(recording_id)
    except RecordingNotFoundError:
        raise HTTPException(status_code=404, detail="Recording not found")
    except VoiceServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/recordings", response_model=List[Recording])
async def list_recordings(
    tenant_id: str,
    user_id: Optional[str] = None,
    status: Optional[RecordingStatus] = None,
    limit: int = 10,
    offset: int = 0,
    service: RecordingService = Depends(get_recording_service)
):
    """
    List voice recordings with optional filters.
    """
    try:
        return await service.list_recordings(
            tenant_id=tenant_id,
            user_id=user_id,
            status=status,
            limit=limit,
            offset=offset
        )
    except VoiceServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
