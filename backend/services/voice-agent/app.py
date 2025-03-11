# voice_processor.py
import os
import json
import time
import asyncio
import uuid
from typing import Dict, List, Optional, TypedDict, Annotated, Sequence, Literal
from datetime import datetime

import redis
import httpx
from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends, Request, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field

# Speech recognition and NLP
import whisper
from openai import AsyncOpenAI

# LangGraph imports
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolExecutor
from langgraph.checkpoint import MemorySaver
from langgraph.graph.message import ChatMessage, AnyMessage
from langgraph.graph.message import AIMessage, HumanMessage
from langgraph.pregel import Pregel

# Text-to-speech
import elevenlabs

# Initialize FastAPI app
app = FastAPI(title="Dental Clinic Voice-Enabled AI Agent API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis connection
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    db=0,
    decode_responses=True
)

# Authentication configuration
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8080")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Initialize Whisper model for speech recognition
whisper_model = whisper.load_model("base")

# Initialize ElevenLabs for text-to-speech
elevenlabs.set_api_key(os.getenv("ELEVENLABS_API_KEY", "your-elevenlabs-api-key"))
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "default-voice-id")

# Initialize OpenAI client
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", "your-openai-api-key"))

# Models
class User(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str

class VoiceCommandRequest(BaseModel):
    clinic_id: str
    source: str  # "reception", "operatory", "mobile"
    session_id: Optional[str] = None

class VoiceCommandResponse(BaseModel):
    session_id: str
    transcript: str
    response_text: str
    response_audio_url: str
    suggested_actions: Optional[List[Dict]] = None

# Authentication middleware
async def verify_token(token: str = Depends(oauth2_scheme)):
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{AUTH_SERVICE_URL}/verify-token",
                json={"token": token}
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return response.json()
        except httpx.RequestError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable",
            )

async def get_current_user(user_data: dict = Depends(verify_token)):
    return User(
        username=user_data["username"],
        email=user_data.get("email"),
        full_name=user_data.get("full_name"),
        role=user_data["role"]
    )

# Dental Tools
class DentalTools:
    """Tools for the dental agent to interact with the dental practice management system"""
    
    async def get_patient_info(self, patient_id: str) -> Dict:
        """Get patient information from the dental system"""
        # In production, this would connect to your dental practice management system
        # This is a mock implementation
        await asyncio.sleep(0.5)  # Simulate API call
        return {
            "id": patient_id,
            "name": "John Doe",
            "age": 35,
            "last_visit": "2024-12-15",
            "upcoming_appointments": [{"date": "2025-03-20", "time": "10:00", "type": "Cleaning"}],
            "insurance": "Delta Dental"
        }
    
    async def get_available_slots(self, date: str, service_type: str) -> List[str]:
        """Get available appointment slots for a specific date"""
        # Mock implementation
        await asyncio.sleep(0.5)
        if date == "2025-03-18":
            return ["09:00", "11:30", "14:00"]
        elif date == "2025-03-19":
            return ["10:00", "13:30", "16:00"]
        else:
            return ["09:30", "11:00", "14:30", "16:30"]
    
    async def schedule_appointment(self, patient_id: str, date: str, time: str, service_type: str) -> Dict:
        """Schedule a new appointment"""
        # Mock implementation
        appointment_id = str(uuid.uuid4())
        await asyncio.sleep(0.5)
        return {
            "appointment_id": appointment_id,
            "patient_id": patient_id,
            "date": date,
            "time": time,
            "service_type": service_type,
            "status": "scheduled"
        }
    
    async def get_treatment_history(self, patient_id: str) -> List[Dict]:
        """Get treatment history for a patient"""
        # Mock implementation
        await asyncio.sleep(0.5)
        return [
            {"date": "2024-12-15", "procedure": "Cleaning", "dentist": "Dr. Smith", "notes": "Normal cleaning, no issues found"},
            {"date": "2024-09-10", "procedure": "Filling", "dentist": "Dr. Johnson", "notes": "Filled cavity on lower right molar"}
        ]

# Initialize dental tools
dental_tools = DentalTools()

# Define the tools for LangGraph
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_patient_info",
            "description": "Get information about a patient",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {
                        "type": "string",
                        "description": "The ID of the patient"
                    }
                },
                "required": ["patient_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_available_slots",
            "description": "Get available appointment slots for a specific date",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "The date in YYYY-MM-DD format"
                    },
                    "service_type": {
                        "type": "string",
                        "description": "The type of service (e.g., Cleaning, Filling)"
                    }
                },
                "required": ["date", "service_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_appointment",
            "description": "Schedule a new appointment",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {
                        "type": "string",
                        "description": "The ID of the patient"
                    },
                    "date": {
                        "type": "string",
                        "description": "The date in YYYY-MM-DD format"
                    },
                    "time": {
                        "type": "string",
                        "description": "The time in HH:MM format"
                    },
                    "service_type": {
                        "type": "string",
                        "description": "The type of service (e.g., Cleaning, Filling)"
                    }
                },
                "required": ["patient_id", "date", "time", "service_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_treatment_history",
            "description": "Get treatment history for a patient",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {
                        "type": "string",
                        "description": "The ID of the patient"
                    }
                },
                "required": ["patient_id"]
            }
        }
    }
]

# Tool mapping for execution
tool_executor_map = {
    "get_patient_info": dental_tools.get_patient_info,
    "get_available_slots": dental_tools.get_available_slots,
    "schedule_appointment": dental_tools.schedule_appointment,
    "get_treatment_history": dental_tools.get_treatment_history
}

# Create tool executor
tool_executor = ToolExecutor(tool_executor_map)

# LangGraph State Definition
class AgentState(TypedDict):
    messages: Annotated[Sequence[AnyMessage], "Messages sent so far"]
    next: Annotated[Optional[str], "Next node to execute"]

# LangGraph Nodes
async def agent(state: AgentState) -> AgentState:
    """LLM agent that decides what action to take next"""
    messages = state["messages"]
    
    llm_response = await openai_client.chat.completions.create(
        model="gpt-4",
        messages=[
            {
                "role": "system", 
                "content": """You are an AI assistant for a dental clinic. Your job is to help staff manage 
                appointments, retrieve patient information, and assist with other administrative tasks.
                Respond in a friendly, professional manner as if speaking to dental staff.
                Keep your responses concise and focused on the task at hand."""
            },
            *[{"role": m.role.value, "content": m.content} for m in messages],
        ],
        tools=tools
    )
    
    response_message = llm_response.choices[0].message
    ai_message = AIMessage(content=response_message.content or "")
    
    # Check if the model wants to call a function
    if response_message.tool_calls:
        tool_call = response_message.tool_calls[0]
        ai_message = AIMessage(
            content=response_message.content or "",
            tool_calls=[{"name": tool_call.function.name, "arguments": tool_call.function.arguments}]
        )
        return {"messages": [*messages, ai_message], "next": "tool_executor"}
    
    # No tool calls, just return the response
    return {"messages": [*messages, ai_message], "next": END}

async def tool_execution(state: AgentState) -> AgentState:
    """Execute tools based on the agent's decisions"""
    messages = state["messages"]
    last_message = messages[-1]
    
    # Extract the tool calls
    if not last_message.tool_calls:
        return {"messages": messages, "next": END}
    
    tool_call = last_message.tool_calls[0]
    name = tool_call["name"]
    arguments = json.loads(tool_call["arguments"])
    
    # Execute the tool
    try:
        result = await tool_executor.aexecute(name, arguments)
        tool_message = AIMessage(
            content="",
            tool_call_id=name,
            name=name,
            tool_calls=last_message.tool_calls,
            tool_results=result
        )
        return {"messages": [*messages, tool_message], "next": "agent"}
    except Exception as e:
        tool_message = AIMessage(
            content=f"Error executing tool {name}: {str(e)}",
            tool_call_id=name,
            name=name,
            tool_calls=last_message.tool_calls,
            tool_results={"error": str(e)}
        )
        return {"messages": [*messages, tool_message], "next": "agent"}

# Build the LangGraph
def build_agent_graph():
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("agent", agent)
    workflow.add_node("tool_executor", tool_execution)
    
    # Add edges
    workflow.add_edge("agent", "tool_executor")
    workflow.add_edge("tool_executor", "agent")
    
    # Set the entry point
    workflow.set_entry_point("agent")
    
    # Compile the graph
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)

# Initialize agent graph
agent_graph = build_agent_graph()

# Session management
class SessionManager:
    def __init__(self, redis_client):
        self.redis_client = redis_client
        
    def create_session(self, clinic_id: str, source: str) -> str:
        session_id = str(uuid.uuid4())
        session_data = {
            "clinic_id": clinic_id,
            "source": source,
            "created_at": datetime.utcnow().isoformat(),
            "last_interaction": datetime.utcnow().isoformat(),
            "interaction_count": 0
        }
        self.redis_client.hset(f"voice_session:{session_id}", mapping=session_data)
        self.redis_client.expire(f"voice_session:{session_id}", 3600)  # 1 hour expiry
        return session_id
    
    def update_session(self, session_id: str, transcript: str, response: str) -> bool:
        session_key = f"voice_session:{session_id}"
        if not self.redis_client.exists(session_key):
            return False
        
        # Update session data
        interaction_count = int(self.redis_client.hget(session_key, "interaction_count") or 0)
        self.redis_client.hset(session_key, mapping={
            "last_interaction": datetime.utcnow().isoformat(),
            "interaction_count": interaction_count + 1,
            f"transcript:{interaction_count}": transcript,
            f"response:{interaction_count}": response
        })
        self.redis_client.expire(session_key, 3600)  # Reset expiry on interaction
        return True
    
    def get_session_history(self, session_id: str) -> List[Dict]:
        session_key = f"voice_session:{session_id}"
        if not self.redis_client.exists(session_key):
            return []
        
        session_data = self.redis_client.hgetall(session_key)
        interaction_count = int(session_data.get("interaction_count", 0))
        
        history = []
        for i in range(interaction_count):
            history.append({
                "transcript": session_data.get(f"transcript:{i}", ""),
                "response": session_data.get(f"response:{i}", "")
            })
        
        return history

session_manager = SessionManager(redis_client)

# Voice processing functions
async def process_audio_file(file_path: str) -> str:
    """
    Process audio file using Whisper and return transcribed text
    """
    result = whisper_model.transcribe(file_path)
    return result["text"].strip()

async def generate_agent_response(transcript: str, session_id: str = None) -> str:
    """
    Generate agent response using LangGraph and the dental tools
    """
    # Create messages history if session exists
    messages = []
    if session_id:
        session_history = session_manager.get_session_history(session_id)
        for interaction in session_history:
            messages.append(HumanMessage(content=interaction["transcript"]))
            messages.append(AIMessage(content=interaction["response"]))
    
    # Add the current message
    messages.append(HumanMessage(content=transcript))
    
    # Execute the agent graph
    config = {"configurable": {"thread_id": session_id or str(uuid.uuid4())}}
    result = await agent_graph.ainvoke({"messages": messages, "next": None}, config=config)
    
    # Extract the final AI message
    final_message = next((m for m in reversed(result["messages"]) if isinstance(m, AIMessage) and m.content), None)
    if not final_message:
        return "I'm sorry, I couldn't generate a response at this time."
    
    return final_message.content

async def generate_audio_response(text: str) -> str:
    """
    Generate audio response using ElevenLabs
    """
    audio = elevenlabs.generate(
        text=text,
        voice=VOICE_ID,
        model="eleven_monolingual_v1"
    )
    
    # Save audio to a file with a unique name
    filename = f"response_{uuid.uuid4()}.mp3"
    file_path = f"./audio_responses/{filename}"
    
    # Ensure directory exists
    os.makedirs("./audio_responses", exist_ok=True)
    
    # Save the audio
    with open(file_path, "wb") as f:
        f.write(audio)
    
    # In production, you would upload this to a cloud storage service
    # and return the URL. Here we're just returning the local path.
    return f"/audio_responses/{filename}"

# API endpoints
@app.post("/voice/upload", response_model=VoiceCommandResponse)
async def upload_voice_command(
    background_tasks: BackgroundTasks,
    request: VoiceCommandRequest = Depends(),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Process uploaded voice command and return response
    """
    # Create session or use existing
    session_id = request.session_id or session_manager.create_session(
        request.clinic_id, request.source
    )
    
    # Save uploaded file
    temp_file_path = f"./uploads/audio_{uuid.uuid4()}.wav"
    os.makedirs("./uploads", exist_ok=True)
    
    with open(temp_file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    # Process audio to text
    transcript = await process_audio_file(temp_file_path)
    
    # Generate text response from agent
    response_text = await generate_agent_response(transcript, session_id)
    
    # Update session with this interaction
    session_manager.update_session(session_id, transcript, response_text)
    
    # Generate audio response asynchronously
    audio_url = await generate_audio_response(response_text)
    
    # Clean up the uploaded file
    background_tasks.add_task(os.remove, temp_file_path)
    
    # Parse response for potential suggested actions
    suggested_actions = []
    if "appointment" in response_text.lower():
        suggested_actions.append({
            "action": "view_calendar",
            "label": "Open Calendar"
        })
    if "patient" in response_text.lower() and "information" in response_text.lower():
        suggested_actions.append({
            "action": "search_patient",
            "label": "Search Patient"
        })
    
    return VoiceCommandResponse(
        session_id=session_id,
        transcript=transcript,
        response_text=response_text,
        response_audio_url=audio_url,
        suggested_actions=suggested_actions
    )

@app.post("/voice/stream")
async def stream_voice_command(
    request: Request,
    background_tasks: BackgroundTasks,
    params: VoiceCommandRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Stream voice data for real-time processing
    """
    # In a production environment, you would implement WebSocket handling here
    # for real-time streaming of audio data
    
    return {
        "message": "Streaming not implemented in this example. Please use /voice/upload endpoint."
    }

@app.get("/voice/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get session history
    """
    history = session_manager.get_session_history(session_id)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return {
        "session_id": session_id,
        "history": history
    }

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

# Queue management endpoints for voice processing
@app.post("/voice/queue")
async def queue_voice_task(
    task: Dict,
    current_user: User = Depends(get_current_user)
):
    """
    Queue a voice processing task
    """
    task_id = str(uuid.uuid4())
    task_data = {
        "id": task_id,
        "type": "voice_processing",
        "data": task,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "created_by": current_user.username
    }
    
    # Add to Redis Stream
    redis_client.xadd(
        "voice_processing_queue",
        task_data
    )
    
    return {"task_id": task_id, "status": "queued"}

# Worker process setup (would be in a separate file in production)
async def voice_processor_worker():
    """
    Background worker that processes voice tasks from the queue
    """
    # Create consumer group if it doesn't exist
    try:
        redis_client.xgroup_create(
            "voice_processing_queue",
            "voice_processors",
            id='0',
            mkstream=True
        )
    except redis.exceptions.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise e
    
    print("Voice processor worker started")
    
    while True:
        try:
            # Read new messages with consumer group
            messages = redis_client.xreadgroup(
                "voice_processors",
                "worker-1",
                {"voice_processing_queue": ">"},
                count=1,
                block=5000
            )
            
            if not messages:
                await asyncio.sleep(1)
                continue
            
            for stream, message_list in messages:
                for message_id, data in message_list:
                    # Process the voice task
                    print(f"Processing voice task: {data}")
                    
                    # Acknowledge processing is complete
                    redis_client.xack(
                        "voice_processing_queue",
                        "voice_processors",
                        message_id
                    )
        
        except Exception as e:
            print(f"Error in voice processor worker: {e}")
            await asyncio.sleep(5)

# Start background worker on app startup
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(voice_processor_worker())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)