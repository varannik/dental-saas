from typing import Optional
from pydantic import BaseModel

class User(BaseModel):
    """
    User model for authentication and authorization
    """
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str 