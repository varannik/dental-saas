#!/usr/bin/env python
"""
Entry point script for running the voice agent service
"""
import os
import argparse
import uvicorn

def main():
    """
    Parse command line arguments and run the server
    """
    parser = argparse.ArgumentParser(description="Run the Dental Voice Agent service")
    parser.add_argument(
        "--host", 
        type=str, 
        default=os.getenv("HOST", "0.0.0.0"), 
        help="Host to bind the server to"
    )
    parser.add_argument(
        "--port", 
        type=int, 
        default=int(os.getenv("PORT", "8000")), 
        help="Port to bind the server to"
    )
    parser.add_argument(
        "--reload", 
        action="store_true", 
        help="Enable auto-reload for development"
    )
    parser.add_argument(
        "--workers", 
        type=int, 
        default=int(os.getenv("WORKERS", "1")), 
        help="Number of worker processes"
    )
    
    args = parser.parse_args()
    
    # Run the server
    uvicorn.run(
        "app.main:app", 
        host=args.host, 
        port=args.port, 
        reload=args.reload,
        workers=args.workers if not args.reload else 1  # Workers only work without reload
    )

if __name__ == "__main__":
    main() 