# Dental Clinic Voice-Enabled AI Agent

A microservice that provides voice-enabled AI assistant capabilities for dental clinics. This service handles voice command processing, speech-to-text, text-to-speech, and intelligent responses using LangGraph and OpenAI.

## Features

- Voice command processing with Whisper speech-to-text
- Intelligent responses using OpenAI and LangGraph
- Text-to-speech with ElevenLabs
- Session management for conversation context
- Background processing with Redis streams
- RESTful API with FastAPI
- Real-time voice streaming with WebSockets

## Architecture

The service follows a clean architecture pattern with the following components:

- **API Layer**: FastAPI routes and endpoints
- **Service Layer**: Business logic and external service integration
- **Model Layer**: Data models and validation
- **Worker Layer**: Background processing tasks

## Prerequisites

- Python 3.11+
- Docker and Docker Compose
- OpenAI API key
- ElevenLabs API key

## Installation

### Using Docker (Recommended)

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your API keys
3. Run with Docker Compose:

```bash
docker-compose up -d
```

### Manual Installation

1. Clone the repository
2. Create a virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Copy `.env.example` to `.env` and fill in your API keys
5. Run the application:

```bash
uvicorn app.main:app --reload
```

## API Endpoints

### Voice Command Processing

- `POST /api/v1/voice/upload`: Upload and process a voice command
- `GET /api/v1/voice/sessions/{session_id}`: Get session history
- `POST /api/v1/voice/queue`: Queue a voice processing task

### WebSocket Endpoints

- `WebSocket /ws/voice/{clinic_id}/{source}`: Real-time voice streaming endpoint
  - Query parameters:
    - `session_id` (optional): Session ID for continuing a conversation

### Health Check

- `GET /health`: Service health check

## Using WebSockets for Real-time Voice Streaming

The WebSocket API allows for real-time voice streaming between the client and server. This provides a more responsive user experience compared to the file upload approach.

### WebSocket Message Types

#### From Server to Client:

1. **Connection Established**
   ```json
   {
     "type": "connection_established",
     "session_id": "uuid-of-session"
   }
   ```

2. **Transcript**
   ```json
   {
     "type": "transcript",
     "text": "Transcribed text from user's voice"
   }
   ```

3. **Response**
   ```json
   {
     "type": "response",
     "transcript": "Transcribed text from user",
     "response_text": "AI assistant response text",
     "response_audio_url": "/audio_responses/response_uuid.mp3",
     "session_id": "uuid-of-session"
   }
   ```

4. **Error**
   ```json
   {
     "type": "error",
     "message": "Error message"
   }
   ```

#### From Client to Server:

- Binary audio data (WAV format)

### Example Usage

Check the `examples/websocket_client.html` file for a complete example of how to use the WebSocket API from a web browser.

## Development

### Project Structure

```
voice-agent/
├── app/                      # Main application package
│   ├── api/                  # API endpoints
│   │   ├── routes/           # Route modules
│   │   └── dependencies.py   # API dependencies
│   ├── core/                 # Core application modules
│   │   └── config.py         # App configuration
│   ├── models/               # Data models
│   ├── services/             # Business logic services
│   │   ├── agent/            # Agent implementation
│   │   ├── audio.py          # Audio processing service
│   │   └── session.py        # Session management service
│   └── workers/              # Background workers
├── tests/                    # Test directory
├── examples/                 # Example client implementations
├── uploads/                  # Upload directory for audio files
├── audio_responses/          # Directory for generated audio responses
├── requirements.txt          # Project dependencies
├── Dockerfile                # Docker configuration
├── docker-compose.yml        # Docker Compose for local development
└── .env.example              # Example environment variables
```

### Running Tests

```bash
pytest
```

## License

[MIT License](LICENSE) 