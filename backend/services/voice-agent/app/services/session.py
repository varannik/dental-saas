import uuid
from typing import List, Dict, Optional
from datetime import datetime
import redis

from app.core.config import settings

class SessionManager:
    """
    Manages voice assistant sessions using Redis
    """
    def __init__(self, redis_client: redis.Redis):
        """
        Initialize with Redis client for session storage
        
        Args:
            redis_client: Redis client instance
        """
        self.redis_client = redis_client
    
    def create_session(self, clinic_id: str, source: str) -> str:
        """
        Create a new session for voice interaction
        
        Args:
            clinic_id: ID of the clinic
            source: Source of the interaction (reception, operatory, mobile)
            
        Returns:
            str: Session ID
        """
        session_id = str(uuid.uuid4())
        session_data = {
            "clinic_id": clinic_id,
            "source": source,
            "created_at": datetime.utcnow().isoformat(),
            "last_interaction": datetime.utcnow().isoformat(),
            "interaction_count": 0
        }
        
        self.redis_client.hset(f"voice_session:{session_id}", mapping=session_data)
        self.redis_client.expire(
            f"voice_session:{session_id}", 
            settings.SESSION_EXPIRY_SECONDS
        )
        
        return session_id
    
    def update_session(self, session_id: str, transcript: str, response: str) -> bool:
        """
        Update session with new interaction
        
        Args:
            session_id: ID of the session to update
            transcript: User's transcribed voice input
            response: System's response
            
        Returns:
            bool: True if session was updated successfully, False otherwise
        """
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
        
        # Reset expiry on interaction
        self.redis_client.expire(session_key, settings.SESSION_EXPIRY_SECONDS)
        return True
    
    def get_session_history(self, session_id: str) -> List[Dict]:
        """
        Retrieve interaction history for a session
        
        Args:
            session_id: ID of the session
            
        Returns:
            List[Dict]: List of interaction dictionaries with transcript and response
        """
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