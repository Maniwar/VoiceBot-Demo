#!/usr/bin/env python3
"""
OpenAI Realtime API Demo Server with Real API Orchestration
Voice-to-voice with function calling for real APIs
"""

import asyncio
import json
import os
import uuid
import base64
from datetime import datetime
import logging
from pathlib import Path
from typing import Dict, List, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import websockets
import httpx
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="OpenAI Realtime Voice Bot with API Orchestration")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RealtimeAPIOrchestrator:
    """Manages OpenAI Realtime API connection with function calling for real APIs"""
    
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o-realtime-preview-2024-12-17')
        self.openai_ws = None
        self.client_ws = None
        self.session_id = None
        self.http_client = httpx.AsyncClient()
        self.knowledge_base = {}
        self.load_knowledge_base()
        
    def load_knowledge_base(self):
        """Load sample knowledge base"""
        self.knowledge_base = {
            "company_info": """
            TechCorp is your AI assistant company. 
            Support hours: Monday-Friday 9AM-6PM EST
            Email: support@techcorp.ai
            Refund policy: 30-day money-back guarantee
            Products: Smart Home Hub ($149), Security Camera ($89), Smart Thermostat ($199)
            """,
            "capabilities": """
            I can help you with:
            - Weather information for any city
            - Jokes and humor
            - Random facts and trivia
            - Inspirational quotes
            - Activity suggestions when you're bored
            - Product information and support
            """
        }
    
    async def connect_to_openai(self):
        """Connect to OpenAI Realtime API"""
        try:
            url = f"wss://api.openai.com/v1/realtime?model={self.model}"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "OpenAI-Beta": "realtime=v1"
            }
            
            # Use additional_headers for older versions, extra_headers for newer
            try:
                self.openai_ws = await websockets.connect(url, extra_headers=headers)
            except TypeError:
                # Fallback for older websockets versions
                self.openai_ws = await websockets.connect(url, additional_headers=headers)
                
            logger.info("Connected to OpenAI Realtime API")
            
            # Configure session with function calling
            await self.configure_session()
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to OpenAI: {e}")
            return False
    
    async def configure_session(self):
        """Configure OpenAI session with voice and functions"""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": """You are a helpful AI assistant with access to real-time information and APIs.
                You can check weather, tell jokes, share facts, and help with various tasks.
                Be conversational and friendly. When users ask for weather, jokes, facts, or other information,
                use the appropriate function to get real, current data.
                Always announce when you're calling an API, like 'Let me check that for you' or 'Getting the latest information'.""",
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 200,  # Reduced from 500ms for faster response
                    "create_response": True
                },
                "tools": [
                    {
                        "type": "function",
                        "name": "get_weather",
                        "description": "Get current weather information for a city",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "city": {
                                    "type": "string",
                                    "description": "The city name to get weather for"
                                }
                            },
                            "required": ["city"]
                        }
                    },
                    {
                        "type": "function",
                        "name": "get_joke",
                        "description": "Get a random dad joke",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "type": "function",
                        "name": "get_random_fact",
                        "description": "Get a random interesting fact",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "type": "function",
                        "name": "get_cat_fact",
                        "description": "Get a random fact about cats",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "type": "function",
                        "name": "get_inspirational_quote",
                        "description": "Get an inspirational or motivational quote",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "type": "function",
                        "name": "get_activity_suggestion",
                        "description": "Get a suggestion for an activity when bored",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "type": "function",
                        "name": "search_knowledge_base",
                        "description": "Search internal knowledge base for company information",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "Search query"
                                }
                            },
                            "required": ["query"]
                        }
                    }
                ],
                "tool_choice": "auto",
                "temperature": 0.8,
                "max_response_output_tokens": 4096
            }
        }
        
        await self.openai_ws.send(json.dumps(session_config))
        logger.info("Session configured with voice and API functions")
    
    async def execute_function(self, function_name: str, arguments: dict) -> dict:
        """Execute API calls for function requests"""
        try:
            logger.info(f"Executing function: {function_name} with args: {arguments}")
            
            if function_name == "get_weather":
                city = arguments.get("city", "London")
                response = await self.http_client.get(
                    f"https://wttr.in/{city}?format=j1",
                    timeout=5.0
                )
                if response.status_code == 200:
                    data = response.json()
                    current = data.get("current_condition", [{}])[0]
                    return {
                        "temperature": f"{current.get('temp_C', 'unknown')}°C",
                        "description": current.get("weatherDesc", [{"value": "unknown"}])[0]["value"],
                        "humidity": f"{current.get('humidity', 'unknown')}%",
                        "wind": f"{current.get('windspeedKmph', 'unknown')} km/h"
                    }
                    
            elif function_name == "get_joke":
                response = await self.http_client.get(
                    "https://icanhazdadjoke.com/",
                    headers={"Accept": "application/json"},
                    timeout=5.0
                )
                if response.status_code == 200:
                    return {"joke": response.json().get("joke", "Why don't scientists trust atoms? Because they make up everything!")}
                    
            elif function_name == "get_random_fact":
                response = await self.http_client.get(
                    "https://uselessfacts.jsph.pl/api/v2/facts/random",
                    timeout=5.0
                )
                if response.status_code == 200:
                    return {"fact": response.json().get("text", "The Earth is round!")}
                    
            elif function_name == "get_cat_fact":
                response = await self.http_client.get(
                    "https://catfact.ninja/fact",
                    timeout=5.0
                )
                if response.status_code == 200:
                    return {"fact": response.json().get("fact", "Cats have 9 lives!")}
                    
            elif function_name == "get_inspirational_quote":
                response = await self.http_client.get(
                    "https://api.quotable.io/random",
                    timeout=5.0
                )
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "quote": data.get("content", "Believe in yourself!"),
                        "author": data.get("author", "Unknown")
                    }
                    
            elif function_name == "get_activity_suggestion":
                response = await self.http_client.get(
                    "https://www.boredapi.com/api/activity",
                    timeout=5.0
                )
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "activity": data.get("activity", "Take a walk"),
                        "type": data.get("type", "relaxation"),
                        "participants": data.get("participants", 1)
                    }
                    
            elif function_name == "search_knowledge_base":
                query = arguments.get("query", "").lower()
                results = []
                for key, value in self.knowledge_base.items():
                    if query in value.lower():
                        results.append(value)
                return {"results": results if results else ["No information found in knowledge base"]}
                
            return {"error": f"Unknown function: {function_name}"}
            
        except Exception as e:
            logger.error(f"Function execution error: {e}")
            return {"error": str(e)}
    
    async def handle_openai_messages(self):
        """Handle messages from OpenAI Realtime API"""
        try:
            async for message in self.openai_ws:
                data = json.loads(message)
                event_type = data.get("type")
                
                # Only log key events for cleaner output
                if event_type == "error":
                    logger.error(f"OpenAI error: {data}")
                elif event_type == "session.updated":
                    logger.info("✅ Session configured successfully")
                elif event_type in ["input_audio_buffer.speech_started", 
                                   "input_audio_buffer.speech_stopped",
                                   "response.done"]:
                    # Log key interaction events
                    if event_type == "input_audio_buffer.speech_started":
                        logger.info("👂 Speech detected")
                    elif event_type == "input_audio_buffer.speech_stopped":
                        logger.info("🤔 Processing speech...")
                        # Reset audio counter
                        if hasattr(self, 'audio_chunk_count'):
                            self.audio_chunk_count = 0
                    elif event_type == "response.done":
                        logger.info("✨ Response complete")
                
                # Handle function calls
                if event_type == "response.function_call_arguments.done":
                    function_name = data.get("name")
                    arguments = json.loads(data.get("arguments", "{}"))
                    call_id = data.get("call_id")
                    
                    # Execute the function
                    result = await self.execute_function(function_name, arguments)
                    
                    # Send result back to OpenAI
                    function_result = {
                        "type": "conversation.item.create",
                        "item": {
                            "type": "function_call_output",
                            "call_id": call_id,
                            "output": json.dumps(result)
                        }
                    }
                    await self.openai_ws.send(json.dumps(function_result))
                    
                    # Continue the response
                    await self.openai_ws.send(json.dumps({"type": "response.create"}))
                    
                    # Notify client
                    if self.client_ws:
                        await self.client_ws.send_json({
                            "type": "function_call",
                            "function": function_name,
                            "parameters": arguments,
                            "result": result
                        })
                
                # Forward relevant events to client
                elif event_type in ["response.audio.delta", "response.audio.done",
                                  "response.text.delta", "response.text.done",
                                  "response.audio_transcript.delta", "response.audio_transcript.done",
                                  "session.created", "session.updated",
                                  "conversation.item.input_audio_transcription.completed",
                                  "response.done", "response.created",
                                  "input_audio_buffer.speech_started", "input_audio_buffer.speech_stopped"]:
                    if self.client_ws:
                        await self.client_ws.send_json(data)
                
                # Handle errors specially
                elif event_type == "error":
                    logger.error(f"OpenAI error: {data}")
                    if self.client_ws:
                        await self.client_ws.send_json(data)
                        
        except Exception as e:
            logger.error(f"OpenAI message handler error: {e}")

# Global orchestrator instance
orchestrator = RealtimeAPIOrchestrator()

@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    logger.info("Starting OpenAI Realtime Demo Server with API Orchestration")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for client connections"""
    await websocket.accept()
    session_id = str(uuid.uuid4())
    orchestrator.client_ws = websocket
    orchestrator.session_id = session_id
    
    logger.info(f"Client connected: {session_id}")
    
    # Connect to OpenAI
    if await orchestrator.connect_to_openai():
        await websocket.send_json({
            "type": "connected",
            "session_id": session_id,
            "message": "Connected to OpenAI Realtime API with function calling"
        })
        
        # Start handling OpenAI messages
        openai_task = asyncio.create_task(orchestrator.handle_openai_messages())
        
        try:
            while True:
                # Handle client messages
                data = await websocket.receive_json()
                msg_type = data.get("type")
                
                # Only log non-audio messages to reduce noise
                if msg_type != "audio.input":
                    logger.info(f"Client message: {msg_type}")
                
                if msg_type == "audio.input" and orchestrator.openai_ws:
                    audio_data = data.get("audio", "")
                    if audio_data:  # Only process non-empty audio
                        # Forward audio to OpenAI
                        audio_message = {
                            "type": "input_audio_buffer.append",
                            "audio": audio_data
                        }
                        await orchestrator.openai_ws.send(json.dumps(audio_message))
                        # VAD will auto-detect speech and create responses
                        
                        # Reset counter on speech events to avoid continuous counting
                        if not hasattr(orchestrator, 'audio_chunk_count'):
                            orchestrator.audio_chunk_count = 0
                        orchestrator.audio_chunk_count += 1
                        # Only show indicator during active speech (first 200 chunks = ~4 seconds)
                        if orchestrator.audio_chunk_count == 50:
                            logger.info("🎤 Receiving audio...")
                    
                elif msg_type == "text.input" and orchestrator.openai_ws:
                    # Send text to OpenAI
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
                    await orchestrator.openai_ws.send(json.dumps(text_message))
                    await orchestrator.openai_ws.send(json.dumps({"type": "response.create"}))
                    
        except WebSocketDisconnect:
            logger.info(f"Client disconnected: {session_id}")
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            openai_task.cancel()
            if orchestrator.openai_ws:
                await orchestrator.openai_ws.close()
            orchestrator.client_ws = None
    else:
        await websocket.send_json({
            "type": "error",
            "error": "Failed to connect to OpenAI Realtime API. Check your API key."
        })
        await websocket.close()

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads for knowledge base"""
    try:
        content = await file.read()
        file_id = str(uuid.uuid4())
        
        # Add to knowledge base
        orchestrator.knowledge_base[file_id] = content.decode('utf-8')
        
        return JSONResponse({
            "fileId": file_id,
            "fileName": file.filename,
            "status": "success"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "openai_configured": bool(orchestrator.api_key),
        "timestamp": datetime.now().isoformat()
    }

# Serve static files
@app.get("/")
async def read_index():
    return FileResponse('public/index.html')

@app.get("/app.js")
async def read_app_js():
    return FileResponse('public/app.js')

@app.get("/admin.html")
async def read_admin():
    return FileResponse('public/admin.html')

@app.get("/admin.js")
async def read_admin_js():
    return FileResponse('public/admin.js')

# Mount static files
app.mount("/", StaticFiles(directory="public", html=True), name="static")

if __name__ == "__main__":
    if not os.getenv('OPENAI_API_KEY'):
        logger.error("OPENAI_API_KEY not found in environment!")
        logger.error("Please set your OpenAI API key in .env file")
        import sys
        sys.exit(1)
    
    port = int(os.getenv("PORT", 3000))
    logger.info(f"Starting OpenAI Realtime Demo Server on port {port}")
    logger.info(f"Open http://localhost:{port} in your browser")
    logger.info("Available voice commands: 'weather in [city]', 'tell me a joke', 'inspire me', etc.")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )