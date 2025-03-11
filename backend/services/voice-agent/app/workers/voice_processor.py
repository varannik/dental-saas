import asyncio
import redis
from typing import Dict
from datetime import datetime

from app.core.config import settings

class VoiceProcessorWorker:
    """
    Background worker that processes voice tasks from the queue
    """
    def __init__(self, redis_client: redis.Redis):
        """
        Initialize the worker with Redis client
        
        Args:
            redis_client: Redis client for queue management
        """
        self.redis_client = redis_client
        self.worker_id = "worker-1"  # In production, generate a unique ID
        self.stream_name = "voice_processing_queue"
        self.group_name = "voice_processors"
        self.running = False
    
    async def setup(self):
        """
        Set up the consumer group if it doesn't exist
        """
        try:
            self.redis_client.xgroup_create(
                self.stream_name,
                self.group_name,
                id='0',
                mkstream=True
            )
        except redis.exceptions.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise e
        
        print(f"Voice processor worker {self.worker_id} initialized")
    
    async def process_task(self, task_data: Dict):
        """
        Process a voice task
        
        Args:
            task_data: Task data from the queue
        """
        try:
            # In a real implementation, this would process the voice task
            # For example, it might call a service to transcribe audio,
            # generate a response, etc.
            
            print(f"Processing voice task: {task_data}")
            
            # Simulate processing time
            await asyncio.sleep(1)
            
            # Update task status in a real implementation
            # self.redis_client.hset(f"task:{task_data['id']}", "status", "completed")
            
            return True
        except Exception as e:
            print(f"Error processing task: {e}")
            # Update task status in a real implementation
            # self.redis_client.hset(f"task:{task_data['id']}", "status", "failed")
            return False
    
    async def run(self):
        """
        Run the worker process
        """
        await self.setup()
        self.running = True
        
        print("Voice processor worker started")
        
        while self.running:
            try:
                # Read new messages with consumer group
                messages = self.redis_client.xreadgroup(
                    self.group_name,
                    self.worker_id,
                    {self.stream_name: ">"},
                    count=1,
                    block=5000
                )
                
                if not messages:
                    await asyncio.sleep(1)
                    continue
                
                for stream, message_list in messages:
                    for message_id, data in message_list:
                        # Process the voice task
                        await self.process_task(data)
                        
                        # Acknowledge processing is complete
                        self.redis_client.xack(
                            self.stream_name,
                            self.group_name,
                            message_id
                        )
            
            except Exception as e:
                print(f"Error in voice processor worker: {e}")
                await asyncio.sleep(5)
    
    def stop(self):
        """
        Stop the worker process
        """
        self.running = False
        print(f"Voice processor worker {self.worker_id} stopped")

# Factory function to create a worker
def create_voice_processor_worker(redis_client: redis.Redis) -> VoiceProcessorWorker:
    """
    Create a voice processor worker
    
    Args:
        redis_client: Redis client
        
    Returns:
        VoiceProcessorWorker: Worker instance
    """
    return VoiceProcessorWorker(redis_client) 