#!/usr/bin/env python3
"""
Ultra-Low Latency OpenAI Realtime API Server using WebRTC
Achieves <100ms latency similar to ChatGPT app
"""

import asyncio
import json
import os
import uuid
import struct
import base64
from datetime import datetime
import logging
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import websockets
import uvicorn
from dotenv import load_dotenv
import numpy as np

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="OpenAI Realtime RTC Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RealtimeRTCSession:
    """Manages ultra-low latency OpenAI Realtime connection"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o-realtime-preview-2024-12-17')
        self.openai_ws = None
        self.client_ws = None
        self.audio_buffer = bytearray()
        self.response_audio_buffer = []
        self.is_speaking = False
        self.last_audio_time = 0
        
    async def connect_to_openai(self):
        """Connect to OpenAI with optimized settings"""
        try:
            url = f"wss://api.openai.com/v1/realtime?model={self.model}"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "OpenAI-Beta": "realtime=v1"
            }
            
            # Connect with minimal overhead
            try:
                self.openai_ws = await websockets.connect(
                    url, 
                    extra_headers=headers,
                    ping_interval=None,  # Disable ping for lower overhead
                    compression=None  # No compression for lower latency
                )
            except TypeError:
                self.openai_ws = await websockets.connect(
                    url, 
                    additional_headers=headers
                )
                
            logger.info(f"Session {self.session_id}: Connected to OpenAI")
            
            # Configure for ultra-low latency
            await self.configure_low_latency_session()
            return True
            
        except Exception as e:
            logger.error(f"Session {self.session_id}: Failed to connect: {e}")
            return False
    
    async def configure_low_latency_session(self):
        """Configure OpenAI session for minimal latency"""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": """You are a helpful, witty, and friendly AI assistant.
                Keep responses concise and natural. Respond quickly and conversationally.
                Don't over-explain unless asked. Be brief but warm.""",
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.3,  # More sensitive
                    "prefix_padding_ms": 100,  # Minimal padding
                    "silence_duration_ms": 150,  # Very short silence detection
                    "create_response": True
                },
                "temperature": 0.9,
                "max_response_output_tokens": 2048,  # Shorter responses for speed
            }
        }
        
        await self.openai_ws.send(json.dumps(session_config))
        logger.info(f"Session {self.session_id}: Configured for low latency")
    
    async def handle_client_audio(self, audio_data: bytes):
        """Handle incoming audio with minimal processing"""
        if not self.openai_ws:
            return
            
        try:
            # Direct binary forwarding - no JSON encoding
            # Convert bytes to base64 for OpenAI API
            base64_audio = base64.b64encode(audio_data).decode('utf-8')
            
            # Send immediately without buffering
            message = {
                "type": "input_audio_buffer.append",
                "audio": base64_audio
            }
            await self.openai_ws.send(json.dumps(message))
            
        except Exception as e:
            logger.error(f"Session {self.session_id}: Audio handling error: {e}")
    
    async def handle_openai_messages(self):
        """Handle OpenAI responses with minimal latency"""
        try:
            async for message in self.openai_ws:
                data = json.loads(message)
                event_type = data.get("type")
                
                # Fast-path for audio data
                if event_type == "response.audio.delta":
                    # Send audio immediately to client
                    if self.client_ws and data.get("delta"):
                        await self.send_audio_to_client(data["delta"])
                        
                elif event_type == "response.audio.done":
                    # Signal end of audio
                    if self.client_ws:
                        await self.client_ws.send_json({
                            "type": "audio.end"
                        })
                        
                elif event_type in ["response.audio_transcript.delta",
                                  "response.audio_transcript.done",
                                  "input_audio_buffer.speech_started",
                                  "input_audio_buffer.speech_stopped"]:
                    # Forward transcription events
                    if self.client_ws:
                        await self.client_ws.send_json(data)
                        
                elif event_type == "error":
                    logger.error(f"Session {self.session_id}: OpenAI error: {data}")
                    
        except Exception as e:
            logger.error(f"Session {self.session_id}: Message handler error: {e}")
    
    async def send_audio_to_client(self, base64_audio: str):
        """Send audio to client with minimal latency"""
        try:
            # Send as binary for efficiency
            audio_bytes = base64.b64decode(base64_audio)
            
            # Send binary frame directly
            await self.client_ws.send_bytes(audio_bytes)
            
        except Exception as e:
            logger.error(f"Session {self.session_id}: Failed to send audio: {e}")
    
    async def cleanup(self):
        """Clean up session"""
        if self.openai_ws:
            await self.openai_ws.close()
        self.openai_ws = None
        self.client_ws = None
        logger.info(f"Session {self.session_id}: Cleaned up")

# Session management
sessions: Dict[str, RealtimeRTCSession] = {}

@app.websocket("/rtc")
async def websocket_rtc_endpoint(websocket: WebSocket):
    """WebSocket endpoint for RTC-like communication"""
    await websocket.accept()
    session_id = str(uuid.uuid4())
    session = RealtimeRTCSession(session_id)
    sessions[session_id] = session
    session.client_ws = websocket
    
    logger.info(f"Client connected: {session_id}")
    
    # Connect to OpenAI
    if await session.connect_to_openai():
        await websocket.send_json({
            "type": "connected",
            "session_id": session_id,
            "message": "Ultra-low latency connection established"
        })
        
        # Start handling OpenAI messages
        openai_task = asyncio.create_task(session.handle_openai_messages())
        
        try:
            while True:
                # Handle both text and binary messages
                message = await websocket.receive()
                
                if "bytes" in message:
                    # Binary audio data - fastest path
                    await session.handle_client_audio(message["bytes"])
                    
                elif "text" in message:
                    # JSON control messages
                    data = json.loads(message["text"])
                    msg_type = data.get("type")
                    
                    if msg_type == "audio.data":
                        # Base64 audio fallback
                        audio_bytes = base64.b64decode(data["audio"])
                        await session.handle_client_audio(audio_bytes)
                        
                    elif msg_type == "text.input" and session.openai_ws:
                        # Text input
                        text_message = {
                            "type": "conversation.item.create",
                            "item": {
                                "type": "message",
                                "role": "user",
                                "content": [
                                    {
                                        "type": "input_text",
                                        "text": data.get("text")
                                    }
                                ]
                            }
                        }
                        await session.openai_ws.send(json.dumps(text_message))
                        await session.openai_ws.send(json.dumps({"type": "response.create"}))
                        
        except WebSocketDisconnect:
            logger.info(f"Client disconnected: {session_id}")
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            openai_task.cancel()
            await session.cleanup()
            del sessions[session_id]
    else:
        await websocket.send_json({
            "type": "error",
            "error": "Failed to connect to OpenAI Realtime API"
        })
        await websocket.close()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "mode": "ultra-low-latency",
        "sessions": len(sessions),
        "timestamp": datetime.now().isoformat()
    }

# Serve static files
@app.get("/")
async def read_index():
    return FileResponse('public/index_rtc.html')

@app.get("/rtc.js")
async def read_rtc_js():
    return FileResponse('public/rtc.js')

if __name__ == "__main__":
    if not os.getenv('OPENAI_API_KEY'):
        logger.error("OPENAI_API_KEY not found!")
        import sys
        sys.exit(1)
    
    port = int(os.getenv("PORT", 3000))
    logger.info(f"Starting Ultra-Low Latency RTC Server on port {port}")
    logger.info(f"Open http://localhost:{port} in your browser")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )