import os
import uuid
from typing import Optional
import whisper
import elevenlabs

from app.core.config import settings

class AudioProcessor:
    """
    Handles audio processing for speech recognition and text-to-speech
    """
    def __init__(self):
        """
        Initialize audio processing components
        """
        # Initialize Whisper model for speech recognition
        self.whisper_model = whisper.load_model(settings.WHISPER_MODEL)
        
        # Initialize ElevenLabs for text-to-speech
        elevenlabs.set_api_key(settings.ELEVENLABS_API_KEY)
        self.voice_id = settings.ELEVENLABS_VOICE_ID
        self.tts_model = settings.ELEVENLABS_MODEL
    
    async def transcribe_audio(self, file_path: str) -> str:
        """
        Process audio file using Whisper and return transcribed text
        
        Args:
            file_path: Path to audio file
            
        Returns:
            str: Transcribed text
        """
        try:
            result = self.whisper_model.transcribe(file_path)
            return result["text"].strip()
        except Exception as e:
            # In production, we would log this error
            print(f"Error transcribing audio: {e}")
            return ""
    
    async def generate_audio(self, text: str) -> tuple[str, str]:
        """
        Generate audio response using ElevenLabs
        
        Args:
            text: Text to convert to speech
            
        Returns:
            tuple: (file_path, url) containing the file path and URL for accessing the audio
        """
        try:
            # Generate audio
            audio = elevenlabs.generate(
                text=text,
                voice=self.voice_id,
                model=self.tts_model
            )
            
            # Save audio to a file with a unique name
            filename = f"response_{uuid.uuid4()}.mp3"
            file_path = os.path.join(settings.AUDIO_RESPONSE_DIR, filename)
            
            # Save the audio
            with open(file_path, "wb") as f:
                f.write(audio)
            
            # In production, you would upload this to a cloud storage service
            # For now, return local file path and URL
            url = f"/audio_responses/{filename}"
            
            return file_path, url
            
        except Exception as e:
            # In production, we would log this error
            print(f"Error generating audio: {e}")
            return "", "" 