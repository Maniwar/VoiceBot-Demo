#!/usr/bin/env python3
"""
Simplified VoiceBot Demo Server for testing
Minimal dependencies version
"""

import asyncio
import json
import os
import uuid
from datetime import datetime
import logging
import httpx

from fastapi import FastAPI, WebSocket, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import websockets
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load sample workflows
def load_sample_workflows():
    """Load pre-configured sample workflows"""
    try:
        with open('config/sample_workflows.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning("Sample workflows file not found")
        return {"workflows": [], "functions": [], "api_endpoints": []}

class SimpleRealtimeProxy:
    """Simplified proxy for OpenAI Realtime API"""
    
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o-realtime-preview-2024-12-17')
        self.openai_ws = None
        self.client_connections = {}
        self.sample_config = load_sample_workflows()
        self.http_client = httpx.AsyncClient()
        
    async def connect_to_openai(self, session_id: str):
        """Establish connection to OpenAI Realtime API"""
        try:
            url = f"wss://api.openai.com/v1/realtime?model={self.model}"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "OpenAI-Beta": "realtime=v1"
            }
            
            self.openai_ws = await websockets.connect(url, extra_headers=headers)
            logger.info(f"Connected to OpenAI Realtime API for session {session_id}")
            
            # Configure session with voice
            await self.configure_openai_session()
            
            return True
        except Exception as e:
            logger.error(f"Failed to connect to OpenAI: {e}")
            return False
    
    async def configure_openai_session(self):
        """Configure OpenAI session for voice"""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": "You are a helpful AI assistant. Be conversational and friendly.",
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500
                },
                "temperature": 0.8
            }
        }
        
        await self.openai_ws.send(json.dumps(session_config))
        logger.info("OpenAI session configured")
    
    async def send_to_client(self, session_id: str, message: dict):
        """Send message to connected client"""
        if session_id in self.client_connections:
            client_ws = self.client_connections[session_id]
            if client_ws and not client_ws.closed:
                await client_ws.send(json.dumps(message))

# FastAPI application
app = FastAPI(title="VoiceBot Demo Server (Simple)")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/", StaticFiles(directory="public", html=True), name="static")

# Global proxy instance
proxy = SimpleRealtimeProxy()

# Store for uploaded files
uploaded_files = {}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for client connections"""
    await websocket.accept()
    session_id = str(uuid.uuid4())
    proxy.client_connections[session_id] = websocket
    
    logger.info(f"Client connected: {session_id}")
    
    # Connect to OpenAI
    if await proxy.connect_to_openai(session_id):
        await websocket.send_json({"type": "connected", "session_id": session_id})
        
        try:
            # Create tasks for handling messages
            client_task = asyncio.create_task(handle_client_messages(websocket, session_id))
            openai_task = asyncio.create_task(handle_openai_messages(websocket, session_id))
            
            # Wait for either task to complete
            await asyncio.gather(client_task, openai_task)
            
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            if proxy.openai_ws:
                await proxy.openai_ws.close()
            del proxy.client_connections[session_id]
            logger.info(f"Client disconnected: {session_id}")
    else:
        await websocket.send_json({"type": "error", "error": "Failed to connect to OpenAI"})
        await websocket.close()

async def handle_client_messages(websocket: WebSocket, session_id: str):
    """Handle messages from web client"""
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            
            if msg_type == "audio.input" and proxy.openai_ws:
                # Forward audio to OpenAI
                audio_message = {
                    "type": "input_audio_buffer.append",
                    "audio": message.get("audio")
                }
                await proxy.openai_ws.send(json.dumps(audio_message))
                await proxy.openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
                
            elif msg_type == "text.input" and proxy.openai_ws:
                # Send text message to OpenAI
                text_message = {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "message",
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": message.get("text")
                            }
                        ]
                    }
                }
                await proxy.openai_ws.send(json.dumps(text_message))
                await proxy.openai_ws.send(json.dumps({"type": "response.create"}))
                
    except Exception as e:
        logger.error(f"Client message handler error: {e}")

async def handle_openai_messages(websocket: WebSocket, session_id: str):
    """Handle messages from OpenAI and forward to client"""
    try:
        async for message in proxy.openai_ws:
            data = json.loads(message)
            event_type = data.get("type")
            
            # Forward relevant events to client
            if event_type == "response.text.delta":
                await websocket.send_json({
                    "type": "text.response",
                    "text": data.get("delta", "")
                })
                
            elif event_type == "response.audio.delta":
                await websocket.send_json({
                    "type": "audio.response",
                    "audio": data.get("delta", "")
                })
                
            elif event_type == "response.audio_transcript.delta":
                await websocket.send_json({
                    "type": "transcription",
                    "text": data.get("delta", ""),
                    "role": "assistant"
                })
                
            elif event_type == "conversation.item.input_audio_transcription.completed":
                await websocket.send_json({
                    "type": "transcription",
                    "text": data.get("transcript", ""),
                    "role": "user"
                })
                
            elif event_type == "error":
                await websocket.send_json({
                    "type": "error",
                    "error": data.get("error", {}).get("message", "Unknown error")
                })
                
    except Exception as e:
        logger.error(f"OpenAI message handler error: {e}")

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads"""
    try:
        file_id = str(uuid.uuid4())
        content = await file.read()
        
        # Store file info
        uploaded_files[file_id] = {
            "filename": file.filename,
            "size": len(content),
            "upload_time": datetime.now().isoformat()
        }
        
        # For now, just store the file without RAG processing
        # In production, add RAG indexing here
        
        return JSONResponse({
            "fileId": file_id,
            "fileName": file.filename,
            "chunks": 1,  # Simplified
            "status": "success"
        })
        
    except Exception as e:
        logger.error(f"File upload error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "api_key_configured": bool(os.getenv('OPENAI_API_KEY'))
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    
    logger.info(f"Starting VoiceBot Demo Server (Simplified) on port {port}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )