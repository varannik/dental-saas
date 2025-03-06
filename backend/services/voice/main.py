"""
Voice Processing Service
Handles voice recording uploads, speech-to-text conversion, and entity extraction
"""

import os
import time
import uuid
from datetime import datetime
from typing import List, Optional

import jwt
import requests
from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
import aiohttp
import minio

# Initialize FastAPI app
app = FastAPI(title="Voice Processing Service", description="Dental SaaS Voice Processing API")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment variables
MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/dental_voice")
JWT_SECRET = os.getenv("JWT_SECRET", "development_secret_key")
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://auth-service:3001")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

# Connect to MongoDB
async def get_database():
    db_client = AsyncIOMotorClient(MONGO_URI)
    db = db_client.get_database()
    return db

# Initialize MinIO client
minio_client = minio.Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE,
)

# Make sure buckets exist
try:
    if not minio_client.bucket_exists("voice-recordings"):
        minio_client.make_bucket("voice-recordings")
    print("Voice recordings bucket initialized")
except Exception as e:
    print(f"Error initializing MinIO bucket: {e}")

# Authentication dependency
async def get_current_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    token = authorization.split(" ")[1]
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.InvalidTokenError:
        # Try to verify with auth service as fallback
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{AUTH_SERVICE_URL}/api/auth/verify", 
                    json={"token": token}
                ) as response:
                    result = await response.json()
                    if result.get("valid"):
                        return result.get("user")
                    raise HTTPException(status_code=401, detail="Invalid token")
        except Exception as e:
            print(f"Error verifying token: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")


# Models
class VoiceRecordingCreate(BaseModel):
    patientId: str
    dentistId: str
    procedureId: Optional[str] = None
    recordedAt: datetime = Field(default_factory=datetime.now)


class VoiceRecordingResponse(BaseModel):
    id: str
    fileName: str
    fileSize: int
    duration: int
    mimeType: str
    storagePath: str
    storageUrl: str
    status: str
    recordedAt: datetime
    createdAt: datetime


# Routes
@app.get("/api/voice/health")
async def health_check():
    return {"status": "healthy", "service": "voice-service"}


@app.post("/api/voice/recordings", response_model=VoiceRecordingResponse)
async def upload_recording(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    dentist_id: str = Form(...),
    procedure_id: Optional[str] = Form(None),
    recorded_at: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorClient = Depends(get_database)
):
    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID missing from token")
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    original_filename = file.filename
    extension = original_filename.split(".")[-1] if "." in original_filename else "wav"
    file_path = f"{tenant_id}/{patient_id}/{file_id}.{extension}"
    
    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    
    # Mock duration calculation (in a real app, you'd analyze the audio file)
    # For this example, let's assume 1MB = 1 minute of audio
    duration = int(file_size / (1024 * 1024) * 60) or 10  # Default to 10 seconds if too small
    
    # Upload to MinIO
    try:
        minio_client.put_object(
            bucket_name="voice-recordings",
            object_name=file_path,
            data=file_content,
            length=file_size,
            content_type=file.content_type or "audio/wav"
        )
    except Exception as e:
        print(f"MinIO upload error: {e}")
        raise HTTPException(status_code=500, detail="Error uploading file to storage")
    
    # Generate storage URL
    storage_url = f"http://{MINIO_ENDPOINT}/voice-recordings/{file_path}"
    
    # Parse recorded_at if provided
    recorded_time = datetime.now()
    if recorded_at:
        try:
            recorded_time = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass
    
    # Create database record
    voice_recording = {
        "tenantId": tenant_id,
        "fileName": original_filename,
        "fileSize": file_size,
        "duration": duration,
        "mimeType": file.content_type or "audio/wav",
        "storagePath": file_path,
        "storageUrl": storage_url,
        "dentistId": dentist_id,
        "patientId": patient_id,
        "procedureId": procedure_id,
        "status": "uploaded",
        "recordedAt": recorded_time,
        "createdAt": datetime.now(),
        "updatedAt": datetime.now()
    }
    
    result = await db.voice_recordings.insert_one(voice_recording)
    voice_recording["id"] = str(result.inserted_id)
    
    # Schedule transcription in background
    background_tasks.add_task(process_recording, str(result.inserted_id), db)
    
    return voice_recording


@app.get("/api/voice/recordings/{recording_id}")
async def get_recording(
    recording_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorClient = Depends(get_database)
):
    tenant_id = current_user.get("tenantId")
    
    # Find recording
    from bson.objectid import ObjectId
    recording = await db.voice_recordings.find_one({
        "_id": ObjectId(recording_id),
        "tenantId": tenant_id
    })
    
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    
    recording["id"] = str(recording["_id"])
    del recording["_id"]
    
    return recording


@app.get("/api/voice/recordings")
async def list_recordings(
    patient_id: Optional[str] = None,
    procedure_id: Optional[str] = None,
    dentist_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorClient = Depends(get_database)
):
    tenant_id = current_user.get("tenantId")
    
    # Build query
    query = {"tenantId": tenant_id}
    if patient_id:
        query["patientId"] = patient_id
    if procedure_id:
        query["procedureId"] = procedure_id
    if dentist_id:
        query["dentistId"] = dentist_id
    if status:
        query["status"] = status
    
    # Execute query
    cursor = db.voice_recordings.find(query).sort("recordedAt", -1).skip(offset).limit(limit)
    recordings = []
    
    async for recording in cursor:
        recording["id"] = str(recording["_id"])
        del recording["_id"]
        recordings.append(recording)
    
    # Get total count
    total = await db.voice_recordings.count_documents(query)
    
    return {
        "recordings": recordings,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@app.get("/api/voice/transcriptions/{recording_id}")
async def get_transcription(
    recording_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorClient = Depends(get_database)
):
    tenant_id = current_user.get("tenantId")
    
    # Find transcription
    from bson.objectid import ObjectId
    transcription = await db.transcriptions.find_one({
        "recordingId": ObjectId(recording_id),
        "tenantId": tenant_id
    })
    
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcription not found")
    
    transcription["id"] = str(transcription["_id"])
    del transcription["_id"]
    
    return transcription


@app.get("/api/voice/entities/{recording_id}")
async def get_entities(
    recording_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorClient = Depends(get_database)
):
    tenant_id = current_user.get("tenantId")
    
    # First get the transcription ID
    from bson.objectid import ObjectId
    transcription = await db.transcriptions.find_one({
        "recordingId": ObjectId(recording_id),
        "tenantId": tenant_id
    })
    
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcription not found")
    
    # Find entities
    entities = await db.extracted_entities.find_one({
        "transcriptionId": transcription["_id"],
        "tenantId": tenant_id
    })
    
    if not entities:
        raise HTTPException(status_code=404, detail="Entities not found")
    
    entities["id"] = str(entities["_id"])
    del entities["_id"]
    
    return entities


# Background processing
async def process_recording(recording_id: str, db: AsyncIOMotorClient):
    """Process a voice recording in the background (transcribe and extract entities)"""
    from bson.objectid import ObjectId
    
    try:
        # Update status to processing
        await db.voice_recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "processing", "updatedAt": datetime.now()}}
        )
        
        # Get recording details
        recording = await db.voice_recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            print(f"Recording {recording_id} not found")
            return
        
        # In a real implementation, you would:
        # 1. Download the file from MinIO
        # 2. Send it to a speech-to-text service
        # 3. Process the transcription with NLP for entity extraction
        
        # For this example, we'll simulate these steps with mock data
        await simulate_transcription(recording, db)
        
    except Exception as e:
        print(f"Error processing recording {recording_id}: {e}")
        # Update status to error
        await db.voice_recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "error", "processingError": str(e), "updatedAt": datetime.now()}}
        )


async def simulate_transcription(recording, db):
    """Simulate transcription and entity extraction for demo purposes"""
    from bson.objectid import ObjectId
    
    # Simulate processing time
    await asyncio.sleep(2)
    
    # Create mock transcription
    transcription = {
        "recordingId": recording["_id"],
        "tenantId": recording["tenantId"],
        "text": f"Patient shows signs of mild gingivitis in the lower left quadrant. Recommendation is to improve flossing technique and use an antiseptic mouthwash twice daily. Schedule a follow-up in three weeks.",
        "language": "en-US",
        "confidence": 0.92,
        "segments": [
            {
                "startTime": 0,
                "endTime": 5,
                "text": "Patient shows signs of mild gingivitis in the lower left quadrant.",
                "confidence": 0.95
            },
            {
                "startTime": 5,
                "endTime": 10,
                "text": "Recommendation is to improve flossing technique and use an antiseptic mouthwash twice daily.",
                "confidence": 0.90
            },
            {
                "startTime": 10,
                "endTime": 15,
                "text": "Schedule a follow-up in three weeks.",
                "confidence": 0.94
            }
        ],
        "processingTime": 1500,
        "provider": "demo-transcription-service",
        "createdAt": datetime.now(),
        "updatedAt": datetime.now()
    }
    
    # Save transcription
    transcription_result = await db.transcriptions.insert_one(transcription)
    
    # Update recording status
    await db.voice_recordings.update_one(
        {"_id": recording["_id"]},
        {"$set": {"status": "transcribed", "updatedAt": datetime.now()}}
    )
    
    # Simulate entity extraction
    await asyncio.sleep(1)
    
    # Create mock entities
    entities = {
        "transcriptionId": transcription_result.inserted_id,
        "tenantId": recording["tenantId"],
        "patientId": recording["patientId"],
        "diagnoses": [
            {
                "entity": "mild gingivitis",
                "confidence": 0.85,
                "position": {
                    "start": 23,
                    "end": 38
                }
            }
        ],
        "treatments": [
            {
                "entity": "improve flossing technique",
                "confidence": 0.92,
                "position": {
                    "start": 90,
                    "end": 116
                }
            },
            {
                "entity": "antiseptic mouthwash",
                "confidence": 0.88,
                "position": {
                    "start": 127,
                    "end": 147
                }
            }
        ],
        "medications": [],
        "allergies": [],
        "procedures": [],
        "processingTime": 800,
        "nlpProvider": "demo-nlp-service",
        "requiresReview": False,
        "hasDrugInteractions": False,
        "hasAllergyWarnings": False,
        "createdAt": datetime.now(),
        "updatedAt": datetime.now()
    }
    
    # Save entities
    await db.extracted_entities.insert_one(entities)
    
    # Update recording status
    await db.voice_recordings.update_one(
        {"_id": recording["_id"]},
        {"$set": {"status": "analyzed", "updatedAt": datetime.now()}}
    )


# Required for async background tasks
import asyncio

@app.on_event("startup")
async def startup_event():
    # Verify MongoDB connection
    try:
        db = await get_database()
        await db.command("ping")
        print("Connected to MongoDB")
    except Exception as e:
        print(f"MongoDB connection error: {e}")

    # Verify MinIO connection
    try:
        minio_client.list_buckets()
        print("Connected to MinIO")
    except Exception as e:
        print(f"MinIO connection error: {e}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3003))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True) 