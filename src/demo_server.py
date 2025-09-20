#!/usr/bin/env python3
"""
Demo VoiceBot Server with Real Working APIs
Simplified version with actual functionality
"""

import asyncio
import json
import os
import uuid
from datetime import datetime
import logging
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="VoiceBot Demo Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
connected_clients = {}
uploaded_documents = {}
demo_workflows = None

# Load demo workflows
def load_demo_workflows():
    """Load demo workflow configuration"""
    global demo_workflows
    try:
        config_path = Path("config/demo_workflows.json")
        if config_path.exists():
            with open(config_path, 'r') as f:
                demo_workflows = json.load(f)
                logger.info(f"Loaded {len(demo_workflows.get('workflows', []))} demo workflows")
        else:
            demo_workflows = {"workflows": [], "functions": []}
            logger.warning("No demo workflows found")
    except Exception as e:
        logger.error(f"Failed to load demo workflows: {e}")
        demo_workflows = {"workflows": [], "functions": []}

# Load sample documents into memory (simple RAG simulation)
def load_sample_documents():
    """Load sample documents for RAG"""
    global uploaded_documents
    
    # Add sample company info
    uploaded_documents["company_info"] = {
        "content": """
        TechCorp Support Information:
        - Business Hours: Monday-Friday 9AM-6PM EST, Saturday 10AM-4PM EST
        - Support Email: support@techcorp.example.com
        - Phone: 1-800-TECH-HELP
        - Refund Policy: 30-day money-back guarantee
        - Password Reset: Go to login page, click 'Forgot Password'
        """,
        "type": "support"
    }
    
    # Add sample product info
    uploaded_documents["products"] = {
        "content": """
        Product Catalog:
        - Smart Home Hub: $149.99 - Central control for all smart devices
        - Security Camera: $89.99 - 1080p HD with night vision
        - Smart Thermostat: $199.99 - Learning thermostat that saves energy
        - Smart Door Lock: $279.99 - Keyless entry with fingerprint
        - Robot Vacuum: $399.99 - AI-powered with self-emptying base
        """,
        "type": "products"
    }
    
    logger.info(f"Loaded {len(uploaded_documents)} sample documents")

# API execution handler
async def execute_api_call(workflow_id: str, params: dict = None):
    """Execute a demo workflow API call"""
    if not demo_workflows:
        return {"error": "No workflows loaded"}
    
    workflow = None
    for w in demo_workflows.get("workflows", []):
        if w["id"] == workflow_id:
            workflow = w
            break
    
    if not workflow:
        return {"error": f"Workflow {workflow_id} not found"}
    
    try:
        async with httpx.AsyncClient() as client:
            # Build URL with parameters
            url = workflow["api_endpoint"]
            if params:
                for key, value in params.items():
                    url = url.replace(f"{{{key}}}", str(value))
            
            # Make API call
            headers = workflow.get("headers", {})
            response = await client.get(url, headers=headers, timeout=5.0)
            
            if response.status_code == 200:
                data = response.json()
                
                # Format response based on template
                result = workflow.get("sample_response", str(data))
                
                # Simple template replacement
                if isinstance(data, dict):
                    for key, value in data.items():
                        result = result.replace(f"{{{key}}}", str(value))
                        # Handle nested values
                        if isinstance(value, list) and len(value) > 0:
                            if isinstance(value[0], dict):
                                for subkey, subval in value[0].items():
                                    result = result.replace(f"{{[0].{subkey}}}", str(subval))
                
                return {"success": True, "result": result, "data": data}
            else:
                return {"error": f"API returned status {response.status_code}"}
                
    except Exception as e:
        logger.error(f"API execution error: {e}")
        return {"error": str(e)}

# Search knowledge base (simple implementation)
def search_knowledge(query: str):
    """Simple knowledge base search"""
    results = []
    query_lower = query.lower()
    
    for doc_id, doc in uploaded_documents.items():
        if query_lower in doc["content"].lower():
            results.append({
                "document": doc_id,
                "excerpt": doc["content"][:200] + "...",
                "type": doc["type"]
            })
    
    return results

@app.on_event("startup")
async def startup_event():
    """Initialize server on startup"""
    load_demo_workflows()
    load_sample_documents()
    logger.info("Server initialized with demo data")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication"""
    await websocket.accept()
    client_id = str(uuid.uuid4())
    connected_clients[client_id] = websocket
    
    logger.info(f"Client {client_id} connected")
    
    # Send initial connection confirmation
    await websocket.send_json({
        "type": "connection_established",
        "client_id": client_id,
        "workflows": demo_workflows.get("workflows", []) if demo_workflows else [],
        "message": "Connected to VoiceBot Demo Server"
    })
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            logger.info(f"Received {message_type} from {client_id}")
            
            # Handle different message types
            if message_type == "execute_workflow":
                workflow_id = data.get("workflow_id")
                params = data.get("params", {})
                result = await execute_api_call(workflow_id, params)
                
                await websocket.send_json({
                    "type": "workflow_result",
                    "workflow_id": workflow_id,
                    "result": result
                })
            
            elif message_type == "search_knowledge":
                query = data.get("query", "")
                results = search_knowledge(query)
                
                await websocket.send_json({
                    "type": "search_results",
                    "query": query,
                    "results": results
                })
            
            elif message_type == "get_demo_functions":
                # Send available demo functions
                await websocket.send_json({
                    "type": "demo_functions",
                    "functions": demo_workflows.get("functions", []) if demo_workflows else []
                })
            
            elif message_type == "test_api":
                # Test a specific API
                api_name = data.get("api_name", "dad_joke")
                result = await execute_api_call(api_name)
                
                await websocket.send_json({
                    "type": "api_test_result",
                    "api_name": api_name,
                    "result": result
                })
            
            elif message_type == "chat_message":
                # Simple chat response (without OpenAI)
                user_message = data.get("message", "").lower()
                
                # Check for workflow triggers
                response = None
                for workflow in demo_workflows.get("workflows", []):
                    for trigger in workflow.get("trigger_phrases", []):
                        if trigger in user_message:
                            # Extract parameters if needed
                            params = {}
                            if "city" in workflow["api_endpoint"]:
                                # Simple city extraction
                                words = user_message.split()
                                if "in" in words:
                                    idx = words.index("in")
                                    if idx + 1 < len(words):
                                        params["city"] = words[idx + 1]
                            elif "number" in workflow["api_endpoint"]:
                                # Extract number
                                import re
                                numbers = re.findall(r'\d+', user_message)
                                if numbers:
                                    params["number"] = numbers[0]
                            
                            result = await execute_api_call(workflow["id"], params)
                            response = result.get("result", "I couldn't process that request.")
                            break
                
                # Check for knowledge base queries
                if not response:
                    if any(word in user_message for word in ["support", "hours", "refund", "product", "price"]):
                        results = search_knowledge(user_message)
                        if results:
                            response = f"Based on our knowledge base: {results[0]['excerpt']}"
                        else:
                            response = "I couldn't find that information in our knowledge base."
                
                # Default response
                if not response:
                    response = "I'm a demo bot. Try asking about weather, jokes, facts, or our products!"
                
                await websocket.send_json({
                    "type": "chat_response",
                    "message": response
                })
            
            else:
                # Echo back unknown message types
                await websocket.send_json({
                    "type": "echo",
                    "original": data
                })
                
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
        del connected_clients[client_id]
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if client_id in connected_clients:
            del connected_clients[client_id]

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads for knowledge base"""
    try:
        content = await file.read()
        file_id = str(uuid.uuid4())
        
        # Store document
        uploaded_documents[file_id] = {
            "filename": file.filename,
            "content": content.decode('utf-8') if isinstance(content, bytes) else str(content),
            "type": "user_upload",
            "uploaded_at": datetime.now().isoformat()
        }
        
        logger.info(f"File uploaded: {file.filename}")
        
        return JSONResponse({
            "fileId": file_id,
            "fileName": file.filename,
            "chunks": 1,
            "status": "success"
        })
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/workflows")
async def get_workflows():
    """Get available demo workflows"""
    return JSONResponse({
        "workflows": demo_workflows.get("workflows", []) if demo_workflows else [],
        "functions": demo_workflows.get("functions", []) if demo_workflows else []
    })

@app.get("/api/test/{workflow_id}")
async def test_workflow(workflow_id: str):
    """Test a specific workflow"""
    result = await execute_api_call(workflow_id)
    return JSONResponse(result)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "connected_clients": len(connected_clients),
        "workflows_loaded": len(demo_workflows.get("workflows", [])) if demo_workflows else 0,
        "documents_loaded": len(uploaded_documents),
        "timestamp": datetime.now().isoformat()
    }

# Serve static files
@app.get("/")
async def read_index():
    return FileResponse('public/index.html')

@app.get("/admin.html")
async def read_admin():
    return FileResponse('public/admin.html')

@app.get("/app.js")
async def read_app_js():
    return FileResponse('public/app.js')

@app.get("/admin.js")
async def read_admin_js():
    return FileResponse('public/admin.js')

# Mount static files for any other assets
app.mount("/", StaticFiles(directory="public", html=True), name="static")

if __name__ == "__main__":
    import sys
    
    # Check if config directory exists
    if not Path("config").exists():
        Path("config").mkdir(parents=True)
    
    # Check if public directory exists
    if not Path("public").exists():
        logger.error("Public directory not found! Please ensure public/index.html exists")
        sys.exit(1)
    
    port = int(os.getenv("PORT", 3000))
    logger.info(f"Starting Demo VoiceBot Server on port {port}")
    logger.info(f"Open http://localhost:{port} in your browser")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )