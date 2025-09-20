#!/usr/bin/env python3
"""
VoiceBot Demo Server - Real-time voice assistant with RAG and API orchestration
"""

import asyncio
import base64
import json
import os
import uuid
from datetime import datetime
import logging

from fastapi import FastAPI, WebSocket, UploadFile, File, HTTPException
from fastapi.websockets import WebSocketState
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import websockets
import uvicorn
from dotenv import load_dotenv

# RAG imports
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain.schema import Document
from openai import OpenAI  # For vision API
import aiohttp  # For external API calls
from amadeus import Client, ResponseError  # For flight search
from flight_handler import FlightSearchHandler  # Enhanced flight search
try:
    # Try to use pypdf (newer, better maintained)
    from pypdf import PdfReader
except ImportError:
    # Fall back to PyPDF2 if pypdf not available
    from PyPDF2 import PdfReader

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Set to DEBUG to see all events
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)  # Set server logger to DEBUG

class RealtimeAPIProxy:
    """Proxy for OpenAI Realtime API with RAG and function calling"""
    
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o-realtime-preview-2024-12-17')
        self.openai_client = OpenAI(api_key=self.api_key)  # For vision API
        self.openai_ws = None
        self.client_connections = {}
        self.rag_store = None
        self.embeddings = None
        self.api_config = self.load_api_config()
        self.initialize_rag()
        self.amadeus_client = None
        self.amadeus_credentials = {}
        self.flight_handler = None  # Enhanced flight handler
        
        # Initialize Amadeus client with saved credentials if available
        self.initialize_amadeus_from_config()
        
    def initialize_rag(self):
        """Initialize RAG components"""
        try:
            self.embeddings = OpenAIEmbeddings(
                openai_api_key=self.api_key,
                model="text-embedding-3-small"
            )
            
            # Initialize vector store
            persist_directory = "./data/chroma_db"
            os.makedirs(persist_directory, exist_ok=True)
            
            self.rag_store = Chroma(
                embedding_function=self.embeddings,
                persist_directory=persist_directory
            )
            
            logger.info("RAG system initialized")
        except Exception as e:
            logger.error(f"Failed to initialize RAG: {e}")
    
    def initialize_amadeus_from_config(self):
        """Initialize Amadeus client from saved configuration"""
        try:
            # Find Amadeus configuration in the API config
            if self.api_config and 'endpoints' in self.api_config:
                for endpoint in self.api_config['endpoints']:
                    if endpoint.get('id') == 'amadeus_flight_search':
                        client_id = endpoint.get('client_id')
                        client_secret = endpoint.get('client_secret')
                        if client_id and client_secret:
                            self.amadeus_client = self.initialize_amadeus(client_id, client_secret)
                            if self.amadeus_client:
                                logger.info("Amadeus client initialized from saved configuration")
                            # Also initialize the enhanced flight handler
                            try:
                                self.flight_handler = FlightSearchHandler(client_id, client_secret)
                                logger.info("Enhanced flight handler initialized")
                            except Exception as e:
                                logger.error(f"Failed to initialize flight handler: {e}")
                        break
        except Exception as e:
            logger.error(f"Failed to initialize Amadeus from config: {e}")
    
    def initialize_amadeus(self, client_id=None, client_secret=None):
        """Initialize Amadeus API client for flight search"""
        try:
            # Use provided credentials or stored ones
            if not client_id:
                client_id = self.amadeus_credentials.get('client_id')
            if not client_secret:
                client_secret = self.amadeus_credentials.get('client_secret')
            
            if client_id and client_secret and not client_id.startswith('your_') and client_id != '':
                amadeus = Client(
                    client_id=client_id,
                    client_secret=client_secret,
                    hostname='test'  # Use test environment by default
                )
                logger.info("Amadeus API client initialized")
                # Store credentials for future use
                self.amadeus_credentials['client_id'] = client_id
                self.amadeus_credentials['client_secret'] = client_secret
                return amadeus
            else:
                logger.warning("Amadeus API credentials not configured")
                return None
        except Exception as e:
            logger.error(f"Failed to initialize Amadeus client: {e}")
            return None
    
    def load_api_config(self):
        """Load API configuration from JSON file"""
        try:
            config_path = "./data/api_config.json"
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    logger.info(f"Loaded {len(config.get('endpoints', []))} API endpoints from config")
                    return config
            else:
                logger.warning(f"API config file not found at {config_path}")
                return {"endpoints": []}
        except Exception as e:
            logger.error(f"Failed to load API config: {e}")
            return {"endpoints": []}
    
    def get_api_instructions(self):
        """Generate dynamic instructions based on configured APIs"""
        if not self.api_config.get('endpoints'):
            return ""
        
        instructions = "\n\nConfigured API endpoints:\n"
        for api in self.api_config['endpoints']:
            if api.get('active', True):
                instructions += f"   - {api['id']}: {api['description']}\n"
                if api.get('example'):
                    instructions += f"     Example: \"{api['example']}\"\n"
        return instructions
    
    def get_valid_endpoints(self):
        """Get list of valid endpoint IDs for function definition"""
        return [api['id'] for api in self.api_config.get('endpoints', []) if api.get('active', True)]
    
    async def connect_to_openai(self, session_id: str, rtc_mode: bool = False):
        """Establish connection to OpenAI Realtime API"""
        try:
            if not self.api_key:
                logger.error("OpenAI API key not found in environment variables")
                return False
                
            url = f"wss://api.openai.com/v1/realtime?model={self.model}"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "OpenAI-Beta": "realtime=v1"
            }
            
            self.openai_ws = await websockets.connect(url, additional_headers=headers)
            logger.info(f"Connected to OpenAI Realtime API for session {session_id} (RTC: {rtc_mode})")
            
            # Configure session with voice, RAG, and function calling
            await self.configure_openai_session(rtc_mode=rtc_mode)
            
            return True
        except Exception as e:
            logger.error(f"Failed to connect to OpenAI: {e}")
            return False
    
    async def configure_openai_session(self, rtc_mode: bool = False, voice: str = None, temperature: float = None, custom_instructions: str = None):
        """Configure OpenAI session for voice, RAG, and functions"""
        # Get voice settings from parameters or defaults
        selected_voice = voice or "alloy"
        selected_temp = temperature if temperature is not None else 0.7
        
        logger.info(f"Configuring session: voice={selected_voice}, temp={selected_temp}, rtc={rtc_mode}, custom={bool(custom_instructions)}")
        
        # Build instructions with custom additions and dynamic API config
        api_instructions = self.get_api_instructions()
        base_instructions = f"""You are a helpful AI assistant with FULL ACCESS to a knowledge base through the search_knowledge_base function.
                
                CRITICAL: You MUST ALWAYS use the search_knowledge_base function when users mention:
                - Files, documents, resumes, PDFs, or any uploaded content
                - Names, details, or information from documents
                - "What's in the file", "tell me about", "review", "check", "look at"
                - ANY questions about uploaded content
                
                You have the following functions available:
                1. search_knowledge_base - Search through uploaded documents for relevant information
                2. execute_workflow - Execute multi-step workflows
                3. call_external_api - Call external APIs{api_instructions}
                
                NEVER say you cannot access files. You CAN access them through search_knowledge_base.
                ALWAYS search first, then provide answers based on the results.
                - If no results are found, explain that the information is not in the knowledge base
                - Show me a dog → use endpoint: 'dog'
                - I need encouragement → use endpoint: 'affirmation'
                - Kanye quote → use endpoint: 'kanye'
                - Trivia question → use endpoint: 'trivia'
                
                Be conversational and natural in your speech."""
        
        # Add custom instructions if provided
        if custom_instructions:
            base_instructions += f"\n\nAdditional instructions: {custom_instructions}"
        else:
            base_instructions += " Speak at a normal, comfortable pace."
        
        base_instructions += " Always explain what you're doing when using functions."
        
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": base_instructions,
                "voice": selected_voice,  # Use the user-selected voice
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "temperature": selected_temp,  # Use the user-selected temperature
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.3,  # Lower threshold to detect speech more easily
                    "prefix_padding_ms": 500,  # More padding to capture beginning
                    "silence_duration_ms": 600,  # Longer silence detection
                    "create_response": True  # Allow interruption to create new response
                },
                "tools": self.get_function_definitions(),
                "tool_choice": "auto"
            }
        }
        
        try:
            await self.openai_ws.send(json.dumps(session_config))
            logger.info("OpenAI session configured with RAG and functions")
        except Exception as e:
            logger.error(f"Error sending session config: {e}")
            logger.error(f"Session config was: {session_config}")
    
    def get_function_definitions(self):
        """Define available functions for the AI assistant"""
        return [
            {
                "type": "function",
                "name": "search_knowledge_base",
                "description": "Search the uploaded knowledge base for relevant information",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query"
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Number of results to return",
                            "default": 3
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "type": "function",
                "name": "execute_workflow",
                "description": "Execute a multi-step workflow",
                "parameters": {
                        "type": "object",
                        "properties": {
                            "workflow_type": {
                                "type": "string",
                                "enum": ["customer_onboarding", "support_ticket", "order_processing", "data_analysis"],
                                "description": "Type of workflow to execute"
                            },
                            "parameters": {
                                "type": "object",
                                "description": "Workflow-specific parameters"
                            }
                        },
                        "required": ["workflow_type"]
                    }
            },
            {
                "type": "function",
                "name": "call_external_api",
                "description": "Call an external API endpoint for weather, jokes, facts, trivia, quotes, Google search, flight search, and more. IMPORTANT: For Google search, extract the search terms from the user's request and pass them in params.query. For image search, also include params.type='image'. For FLIGHT SEARCH: use endpoint='amadeus_flight_search' - you can use city names (e.g., 'New York', 'London') or airport codes. The system will map them automatically. Pass dates as natural language (e.g., 'tomorrow', 'next Friday', 'January 15th'). Examples: Flight search with cities: endpoint='amadeus_flight_search' and params={'origin': 'New York', 'destination': 'London', 'departure_date': 'tomorrow', 'adults': 2}. Flight search with codes: endpoint='amadeus_flight_search' and params={'origin': 'JFK', 'destination': 'CDG', 'departure_date': '2025-01-15', 'travel_class': 'BUSINESS', 'nonstop': true}.",
                "parameters": {
                        "type": "object",
                        "properties": {
                            "endpoint": {
                                "type": "string",
                                "description": f"API endpoint name. Valid values: {', '.join(self.get_valid_endpoints())}",
                                "enum": self.get_valid_endpoints()
                            },
                            "method": {
                                "type": "string",
                                "enum": ["GET", "POST", "PUT", "DELETE"],
                                "default": "GET"
                            },
                            "params": {
                                "type": "object",
                                "description": "API parameters. For google_custom_search: {'query': 'search terms'}. For weather: {'city': 'location'}. For amadeus_flight_search: {'origin': 'city name or airport code', 'destination': 'city name or airport code', 'departure_date': 'date in natural language or YYYY-MM-DD', 'return_date': 'optional for roundtrip', 'adults': number, 'children': number, 'infants': number, 'travel_class': 'ECONOMY/BUSINESS/FIRST', 'nonstop': true/false, 'max_price': number}.",
                                "properties": {
                                    "query": {"type": "string", "description": "Search query for google_custom_search, openlibrary, tvmaze, etc."},
                                    "city": {"type": "string", "description": "City name for weather endpoint"},
                                    "number": {"type": "integer", "description": "Number for number fact endpoint"},
                                    "country": {"type": "string", "description": "Country name or code"},
                                    "name": {"type": "string", "description": "Name for agify, genderize, nationalize endpoints"},
                                    "word": {"type": "string", "description": "Word for dictionary endpoint"},
                                    "artist": {"type": "string", "description": "Artist name for lyrics endpoint"},
                                    "title": {"type": "string", "description": "Song title for lyrics endpoint"},
                                    "character": {"type": "string", "description": "Character name for Star Wars API"},
                                    "pokemon": {"type": "string", "description": "Pokemon name for Pokemon API"},
                                    "username": {"type": "string", "description": "GitHub username"},
                                    "zipcode": {"type": "string", "description": "US zip code"},
                                    "address": {"type": "string", "description": "Address for geocoding"},
                                    "text": {"type": "string", "description": "Text to translate"},
                                    "target": {"type": "string", "description": "Target language for translation"},
                                    "source": {"type": "string", "description": "Source language for translation"},
                                    "ip": {"type": "string", "description": "IP address for ipinfo endpoint"},
                                    "currency": {"type": "string", "description": "Currency code for exchange rates"},
                                    "origin": {"type": "string", "description": "Origin airport code for flight search (e.g., NYC, LAX, LON)"},
                                    "destination": {"type": "string", "description": "Destination airport code for flight search"},
                                    "departure_date": {"type": "string", "description": "Departure date in YYYY-MM-DD format for flight search"},
                                    "return_date": {"type": "string", "description": "Optional return date in YYYY-MM-DD format for round trip flights"},
                                    "adults": {"type": "integer", "description": "Number of adult passengers (default: 1)"},
                                    "children": {"type": "integer", "description": "Number of child passengers ages 2-11 (default: 0)"},
                                    "infants": {"type": "integer", "description": "Number of infant passengers under 2 (default: 0)"},
                                    "travel_class": {"type": "string", "description": "Travel class: ECONOMY, PREMIUM_ECONOMY, BUSINESS, or FIRST (default: ECONOMY)"},
                                    "nonstop_only": {"type": "boolean", "description": "Only show non-stop flights (default: false)"},
                                    "max_price": {"type": "number", "description": "Maximum price per person in USD"},
                                    "trip_type": {"type": "string", "description": "Type of trip: oneway, roundtrip, or multicity (default: oneway if no return_date, roundtrip if return_date provided)"}
                                }
                            }
                        },
                        "required": ["endpoint", "params"]
                    }
            }
        ]
    
    async def handle_function_call(self, function_name: str, arguments: dict, session_id: str, call_id: str = None):
        """Handle function calls from OpenAI"""
        logger.info(f"Executing function: {function_name} with args: {arguments}")
        
        result = {}
        
        try:
            if function_name == "search_knowledge_base":
                query = arguments.get("query", "")
                top_k = arguments.get("top_k", 5)
                logger.info(f"Executing RAG search: query='{query}', top_k={top_k}")
                result = await self.search_rag(query, top_k)
                logger.info(f"RAG search result: {result.get('count', 0)} documents found")
                
            elif function_name == "execute_workflow":
                result = await self.execute_workflow(
                    arguments.get("workflow_type"),
                    arguments.get("parameters", {})
                )
                
            elif function_name == "call_external_api":
                result = await self.call_api(
                    arguments.get("endpoint"),
                    arguments.get("method", "GET"),
                    arguments.get("params", {})
                )
                
                # Ensure result is a dictionary
                if isinstance(result, str):
                    try:
                        result = json.loads(result)
                    except:
                        result = {"response": result}
                
                # If the result contains an image URL, format it for the LLM to describe
                if isinstance(result, dict) and result.get("response_type") == "image" and result.get("response", {}).get("image_url"):
                    image_url = result["response"]["image_url"]
                    # Create a descriptive output for the LLM
                    result_output = {
                        "type": "image",
                        "url": image_url,
                        "description": result["response"].get("description", "Image retrieved successfully"),
                        "note": f"I've retrieved an image from {arguments.get('endpoint')}. The image shows: {result['response'].get('description', 'A picture')}. The image URL is: {image_url}"
                    }
                else:
                    result_output = result
            else:
                # Not an image result, use the result as-is
                result_output = result
            
            # Send result back to OpenAI
            # For OpenAI Realtime API, we need to create the response properly
            function_response = {
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": call_id or str(uuid.uuid4()),
                    "output": json.dumps(result_output)
                }
            }
            
            if self.openai_ws:
                await self.openai_ws.send(json.dumps(function_response))
                # Trigger response generation after function output
                await self.openai_ws.send(json.dumps({"type": "response.create"}))
                
            # Notify client of function execution
            await self.send_to_client(session_id, {
                "type": "function.result",
                "function": function_name,
                "result": result
            })
            
        except Exception as e:
            logger.error(f"Function execution error: {e}")
            result = {"error": str(e)}
        
        return result
    
    async def search_rag(self, query: str, top_k: int = 5):
        """Search the RAG knowledge base"""
        try:
            if not self.rag_store:
                logger.warning("Knowledge base not initialized")
                return {"error": "Knowledge base not initialized", "results": []}
            
            # Log the search query
            logger.info(f"Searching RAG for: '{query}' (top_k={top_k})")
            
            # Get collection info for debugging
            try:
                collection = self.rag_store._collection
                doc_count = collection.count()
                logger.info(f"RAG store has {doc_count} documents")
            except:
                pass
            
            # Perform similarity search with increased results
            docs = self.rag_store.similarity_search(query, k=top_k)
            
            if not docs:
                logger.info(f"No results found for query: {query}")
                # Try a broader search with just keywords
                keywords = query.lower().split()[:3]  # Take first 3 words
                keyword_query = " ".join(keywords)
                logger.info(f"Trying keyword search: {keyword_query}")
                docs = self.rag_store.similarity_search(keyword_query, k=top_k)
            
            if not docs:
                return {
                    "query": query,
                    "results": [],
                    "count": 0,
                    "message": "No relevant documents found. Please make sure documents are uploaded to the knowledge base."
                }
            
            results = []
            sources = []  # Track unique sources
            for i, doc in enumerate(docs):
                filename = doc.metadata.get("filename", "unknown")
                chunk_index = doc.metadata.get("chunk_index", 0)
                
                results.append({
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                    "relevance_rank": i + 1,
                    "file_id": doc.metadata.get("file_id", "unknown"),
                    "source": f"{filename} (chunk {chunk_index + 1})"
                })
                
                if filename not in sources:
                    sources.append(filename)
            
            logger.info(f"RAG search for '{query}' returned {len(results)} results")
            logger.info(f"First result preview: {results[0]['content'][:100]}...")
            
            # Format a summary for the AI
            formatted_response = {
                "query": query,
                "results": results,
                "count": len(results),
                "sources": sources,  # List of unique source files
                "summary": f"Found {len(results)} relevant chunks from {len(sources)} document(s): {', '.join(sources)}. Content: {' '.join([r['content'] for r in results[:2]])}" if results else "No results found."
            }
            
            return formatted_response
            
        except Exception as e:
            logger.error(f"RAG search error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {"error": str(e), "results": []}
    
    async def execute_workflow(self, workflow_type: str, parameters: dict):
        """Execute a multi-step workflow"""
        workflow_id = str(uuid.uuid4())
        start_time = datetime.now()
        
        workflows = {
            "customer_onboarding": [
                "verify_identity",
                "create_account", 
                "send_welcome_email",
                "schedule_followup"
            ],
            "support_ticket": [
                "categorize_issue",
                "check_knowledge_base",
                "create_ticket",
                "assign_agent",
                "send_confirmation"
            ],
            "order_processing": [
                "validate_order",
                "check_inventory",
                "process_payment",
                "generate_invoice",
                "arrange_shipping"
            ],
            "data_analysis": [
                "fetch_data",
                "clean_data",
                "run_analysis",
                "generate_report"
            ]
        }
        
        steps = workflows.get(workflow_type, [])
        completed_steps = []
        
        # Simulate workflow execution
        for step in steps:
            await asyncio.sleep(0.5)  # Simulate processing time
            completed_steps.append(step)
            logger.info(f"Workflow {workflow_id}: Completed step {step}")
        
        duration = (datetime.now() - start_time).total_seconds() * 1000
        
        return {
            "workflow_id": workflow_id,
            "type": workflow_type,
            "status": "completed",
            "steps_executed": completed_steps,
            "duration_ms": int(duration),
            "parameters": parameters
        }
    
    async def call_api(self, endpoint: str, method: str, params: dict = None):
        """Make real external API calls using dynamic configuration"""
        # Ensure params is a dictionary
        if params is None:
            params = {}
        elif not isinstance(params, dict):
            params = {}
        
        # Find the API configuration
        api_config = None
        for api in self.api_config.get('endpoints', []):
            if api['id'] == endpoint and api.get('active', True):
                api_config = api
                break
        
        if not api_config:
            # Fall back to hardcoded implementation for backwards compatibility
            return await self.call_api_legacy(endpoint, method, params)
        
        # Special handling for flight search
        if endpoint == 'amadeus_flight_search':
            # Check if we have Amadeus credentials from the configuration
            if not self.amadeus_client and api_config:
                client_id = api_config.get('client_id', '')
                client_secret = api_config.get('client_secret', '')
                if client_id and client_secret:
                    self.amadeus_client = self.initialize_amadeus(client_id, client_secret)
                    # Also initialize the enhanced flight handler if not already done
                    if not self.flight_handler:
                        try:
                            self.flight_handler = FlightSearchHandler(client_id, client_secret)
                            logger.info("Enhanced flight handler initialized from API config")
                        except Exception as e:
                            logger.error(f"Failed to initialize flight handler: {e}")
            return await self.search_flights(params)
        
        try:
            # Use configured API
            url = api_config['url']
            
            # Replace URL parameters if any
            if api_config.get('params') and isinstance(api_config['params'], list):
                for param in api_config['params']:
                    if param in params:
                        value = params.get(param, '')
                        url = url.replace(f"{{{param}}}", str(value))
            
            headers = api_config.get('headers', {}).copy()
            
            # Special handling for Google Custom Search - add cx parameter and handle image search
            if endpoint == 'google_custom_search' and api_config.get('search_engine_id'):
                # If cx is not in params or is empty, use the configured search engine ID
                if 'cx' not in params or not params.get('cx'):
                    cx_value = api_config['search_engine_id']
                    # Replace {cx} in the URL if it exists
                    url = url.replace('{cx}', cx_value)
                
                # Add searchType=image if this is an image search request
                if params.get('searchType') == 'image' or params.get('type') == 'image':
                    separator = '&' if '?' in url else '?'
                    url = f"{url}{separator}searchType=image"
            
            # Handle authentication
            if api_config.get('api_key'):
                auth_type = api_config.get('auth_type', 'none')
                auth_param = api_config.get('auth_param', 'Authorization')
                api_key = api_config.get('api_key')
                
                if auth_type == 'header':
                    # Add API key to headers
                    if auth_param.lower() == 'authorization':
                        headers[auth_param] = f"Bearer {api_key}"
                    else:
                        headers[auth_param] = api_key
                elif auth_type == 'query':
                    # Add API key to URL as query parameter
                    separator = '&' if '?' in url else '?'
                    url = f"{url}{separator}{auth_param}={api_key}"
            
            async with aiohttp.ClientSession() as session:
                if method.upper() == 'GET':
                    async with session.get(url, headers=headers) as response:
                        response_text = await response.text()
                        
                        if response.status == 200:
                            try:
                                data = json.loads(response_text)
                            except json.JSONDecodeError as e:
                                logger.error(f"Failed to parse JSON response: {e}")
                                logger.error(f"Response text: {response_text}")
                                return {
                                    "endpoint": endpoint,
                                    "method": method,
                                    "error": f"Invalid JSON response: {str(e)}",
                                    "response_text": response_text[:1000],
                                    "timestamp": datetime.now().isoformat(),
                                    "status": "error"
                                }
                            
                            # Special handling for image URLs in responses
                            # Check if this is a dog API response with an image
                            if endpoint == 'dog' and 'message' in data:
                                return {
                                    "endpoint": endpoint,
                                    "method": method,
                                    "response": {
                                        "image_url": data['message'],
                                        "status": data.get('status', 'success'),
                                        "description": "Here's a random dog picture!"
                                    },
                                    "timestamp": datetime.now().isoformat(),
                                    "status": "success",
                                    "response_type": "image"
                                }
                            
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": data,
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
                        else:
                            # Non-200 response
                            logger.error(f"API returned status {response.status} for {endpoint}")
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "error": f"API returned status {response.status}",
                                "response_text": response_text[:1000],
                                "timestamp": datetime.now().isoformat(),
                                "status": "error"
                            }
                elif method.upper() == 'POST':
                    # Build request body from template if available
                    body = None
                    if api_config.get('body_template'):
                        body = api_config['body_template'].copy()
                        # Replace template variables with actual params
                        for key, value in body.items():
                            if isinstance(value, str) and value.startswith('{') and value.endswith('}'):
                                param_key = value[1:-1]
                                if param_key in params:
                                    body[key] = params[param_key]
                    else:
                        body = params
                    
                    async with session.post(url, headers=headers, json=body) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": data,
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
        except Exception as e:
            logger.error(f"API call failed for {endpoint}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                "endpoint": endpoint,
                "method": method,
                "error": str(e),
                "timestamp": datetime.now().isoformat(),
                "status": "error"
            }
        
        # If API call fails, try legacy implementation
        return await self.call_api_legacy(endpoint, method, params)
    
    async def call_api_legacy(self, endpoint: str, method: str, params: dict = None):
        """Legacy hardcoded API calls for backwards compatibility"""
        if params is None:
            params = {}
        
        try:
            # Make real API calls based on endpoint
            if endpoint == "weather":
                # Use wttr.in API for real weather data (no API key needed)
                location = params.get("location", "New York").replace(" ", "+")
                url = f"https://wttr.in/{location}?format=j1"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            current = data.get("current_condition", [{}])[0]
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "temperature": int(current.get("temp_F", 0)),
                                    "condition": current.get("weatherDesc", [{}])[0].get("value", "Unknown"),
                                    "humidity": int(current.get("humidity", 0)),
                                    "location": location.replace("+", " "),
                                    "wind_speed": current.get("windspeedMiles", "0") + " mph",
                                    "feels_like": int(current.get("FeelsLikeF", 0))
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "dad_jokes":
                # Use icanhazdadjoke.com API
                url = "https://icanhazdadjoke.com/"
                headers = {"Accept": "application/json"}
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, headers=headers) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "joke": data.get("joke", "Why did the scarecrow win an award? He was outstanding in his field!"),
                                    "category": "dad_joke"
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "fun_fact" or endpoint == "fact":
                # Use uselessfacts.jsph.pl API
                url = "https://uselessfacts.jsph.pl/api/v2/facts/random"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "fact": data.get("text", "The moon is moving away from Earth at a rate of 1.5 inches per year."),
                                    "category": "random"
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "motivational_quote" or endpoint == "inspiration":
                # Use quotable.io API
                url = "https://api.quotable.io/quotes/random"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            quote_data = data[0] if isinstance(data, list) else data
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "quote": quote_data.get("content", "Believe in yourself."),
                                    "author": quote_data.get("author", "Unknown")
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "random_advice" or endpoint == "advice":
                # Use adviceslip.com API
                url = "https://api.adviceslip.com/advice"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "advice": data.get("slip", {}).get("advice", "Always be kind to others."),
                                    "category": "life"
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "bored_activity" or endpoint == "activity":
                # Use boredapi.com
                url = "https://boredapi.com/api/activity"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "activity": data.get("activity", "Learn a new skill"),
                                    "type": data.get("type", "education"),
                                    "participants": data.get("participants", 1),
                                    "accessibility": data.get("accessibility", 0.5)
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "number_fact" or endpoint == "number":
                # Use numbersapi.com
                number = params.get("number", 42)
                url = f"http://numbersapi.com/{number}?json"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "number": number,
                                    "fact": data.get("text", f"{number} is an interesting number."),
                                    "type": data.get("type", "trivia")
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "dog" or endpoint == "dog_fact":
                # Use dog.ceo API for dog pictures
                url = "https://dog.ceo/api/breeds/image/random"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "image_url": data.get("message", ""),
                                    "fact": "Dogs have been human companions for over 15,000 years!",
                                    "status": data.get("status", "success")
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "affirmation":
                # Use affirmations.dev API
                url = "https://www.affirmations.dev/"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "affirmation": data.get("affirmation", "You are capable of amazing things."),
                                    "category": "positive"
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "kanye":
                # Use api.kanye.rest
                url = "https://api.kanye.rest/"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            return {
                                "endpoint": endpoint,
                                "method": method,
                                "response": {
                                    "quote": data.get("quote", "I am a creative genius."),
                                    "author": "Kanye West"
                                },
                                "timestamp": datetime.now().isoformat(),
                                "status": "success"
                            }
            
            elif endpoint == "trivia":
                # Use the-trivia-api.com
                url = "https://the-trivia-api.com/v2/questions?limit=1"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            if data and len(data) > 0:
                                trivia = data[0]
                                return {
                                    "endpoint": endpoint,
                                    "method": method,
                                    "response": {
                                        "question": trivia.get("question", {}).get("text", "What is the capital of France?"),
                                        "answer": trivia.get("correctAnswer", "Paris"),
                                        "category": trivia.get("category", "general"),
                                        "difficulty": trivia.get("difficulty", "medium")
                                    },
                                    "timestamp": datetime.now().isoformat(),
                                    "status": "success"
                                }
            
            # Fallback for unknown endpoints
            return {
                "endpoint": endpoint,
                "method": method,
                "error": f"Unknown endpoint: {endpoint}",
                "timestamp": datetime.now().isoformat(),
                "status": "error"
            }
            
        except Exception as e:
            logger.error(f"API call error for {endpoint}: {e}")
            # Return a fallback response on error
            return {
                "endpoint": endpoint,
                "method": method,
                "error": str(e),
                "timestamp": datetime.now().isoformat(),
                "status": "error"
            }
    
    async def search_flights(self, params: dict):
        """Search for flights using Amadeus API"""
        # Use enhanced flight handler if available
        if self.flight_handler:
            result = await self.flight_handler.search_flights(params)
            # Format for API response
            if result['status'] == 'success':
                return {
                    "endpoint": "amadeus_flight_search",
                    "method": "POST",
                    "response": result,
                    "timestamp": datetime.now().isoformat(),
                    "status": "success"
                }
            else:
                return {
                    "endpoint": "amadeus_flight_search",
                    "error": result.get('message', 'Flight search failed'),
                    "error_code": result.get('error_code', 'UNKNOWN'),
                    "timestamp": datetime.now().isoformat(),
                    "status": "error"
                }
        
        # Fallback to original implementation
        try:
            if not self.amadeus_client:
                return {
                    "endpoint": "flight_search",
                    "error": "Flight search not configured. Please set up Amadeus API credentials.",
                    "status": "error"
                }
            
            # Extract parameters
            origin = params.get('origin', '').upper()[:3]  # Airport code (e.g., NYC, LON)
            destination = params.get('destination', '').upper()[:3]
            departure_date = params.get('departure_date')
            return_date = params.get('return_date')
            adults = int(params.get('adults', 1))
            children = int(params.get('children', 0))
            infants = int(params.get('infants', 0))
            travel_class = params.get('travel_class', 'ECONOMY').upper()
            nonstop_only = params.get('nonstop_only', False)
            max_price = params.get('max_price')
            trip_type = params.get('trip_type', 'roundtrip' if return_date else 'oneway')
            
            # Validate required parameters
            if not origin or not destination or not departure_date:
                return {
                    "endpoint": "flight_search",
                    "error": "Missing required parameters: origin, destination, and departure_date",
                    "status": "error"
                }
            
            # Search for flights
            logger.info(f"Searching flights: {origin} to {destination} on {departure_date}")
            logger.info(f"Passengers: {adults} adults, {children} children, {infants} infants")
            logger.info(f"Class: {travel_class}, Non-stop only: {nonstop_only}")
            
            # Build search parameters
            search_params = {
                'originLocationCode': origin,
                'destinationLocationCode': destination,
                'departureDate': departure_date,
                'adults': adults,
                'max': 5  # Limit to 5 results for voice interface
            }
            
            # Add optional parameters
            if return_date:
                search_params['returnDate'] = return_date
            if children > 0:
                search_params['children'] = children
            if infants > 0:
                search_params['infants'] = infants
            if travel_class != 'ECONOMY':
                search_params['travelClass'] = travel_class
            if nonstop_only:
                search_params['nonStop'] = 'true'
            if max_price:
                search_params['maxPrice'] = int(max_price)
            
            # Add timeout for the API call
            import asyncio
            try:
                # Run the synchronous Amadeus API call with a 10-second timeout
                loop = asyncio.get_event_loop()
                response = await asyncio.wait_for(
                    loop.run_in_executor(
                        None, 
                        lambda: self.amadeus_client.shopping.flight_offers_search.get(**search_params)
                    ),
                    timeout=20.0  # 20 second timeout for slow test environment
                )
            except asyncio.TimeoutError:
                logger.error("Amadeus API call timed out")
                return {
                    "endpoint": "flight_search",
                    "error": "Flight search is taking longer than expected. Please try again.",
                    "status": "error"
                }
            except Exception as api_error:
                logger.error(f"Amadeus API call failed: {api_error}")
                return {
                    "endpoint": "flight_search",
                    "error": f"Failed to search flights: {str(api_error)}",
                    "status": "error"
                }
            
            # Parse results with better error checking
            flights = []
            
            # Check if response has data attribute and it's not empty
            if not hasattr(response, 'data'):
                logger.error(f"Amadeus response has no data attribute. Response type: {type(response)}")
                return {
                    "endpoint": "flight_search",
                    "error": "Invalid response from flight search API",
                    "status": "error"
                }
            
            if not response.data:
                return {
                    "endpoint": "flight_search",
                    "method": "POST",
                    "response": {
                        "origin": origin,
                        "destination": destination,
                        "departure_date": departure_date,
                        "return_date": return_date,
                        "passengers": f"{adults} adults" + (f", {children} children" if children else "") + (f", {infants} infants" if infants else ""),
                        "travel_class": travel_class,
                        "flights": [],
                        "message": "No flights found for the specified route and date."
                    },
                    "status": "success"
                }
            
            # Process each flight offer
            for idx, offer in enumerate(response.data[:5]):  # Limit to 5 results
                try:
                    # Validate offer is a dictionary
                    if not isinstance(offer, dict):
                        logger.warning(f"Offer {idx} is not a dictionary: {type(offer)}")
                        continue
                    
                    # Extract flight details with safe navigation
                    price_info = offer.get('price', {})
                    if isinstance(price_info, dict):
                        price = price_info.get('total', 'N/A')
                        currency = price_info.get('currency', 'USD')
                    else:
                        price = 'N/A'
                        currency = 'USD'
                
                        # Get first segment for departure info with safe navigation
                    itineraries = offer.get('itineraries', [])
                    if not itineraries or not isinstance(itineraries, list):
                        continue
                    
                    first_itinerary = itineraries[0] if isinstance(itineraries[0], dict) else {}
                    segments = first_itinerary.get('segments', [])
                    if not segments or not isinstance(segments, list):
                        continue
                    
                    first_segment = segments[0] if isinstance(segments[0], dict) else {}
                    airline = first_segment.get('carrierCode', 'Unknown')
                    
                    # Safely extract departure and arrival info
                    departure_info = first_segment.get('departure', {})
                    arrival_info = first_segment.get('arrival', {})
                    departure_time = departure_info.get('at', 'N/A') if isinstance(departure_info, dict) else 'N/A'
                    arrival_time = arrival_info.get('at', 'N/A') if isinstance(arrival_info, dict) else 'N/A'
                    duration = first_itinerary.get('duration', 'N/A')
                    
                    # Format flight info with safe price calculation
                    try:
                        if price != 'N/A' and (adults + children) > 1:
                            price_per_person = f"{currency} {float(price) / (adults + children):.2f}"
                        else:
                            price_per_person = f"{currency} {price}"
                    except (ValueError, TypeError):
                        price_per_person = f"{currency} {price}"
                    
                    flight_info = {
                        "airline": airline,
                        "price": f"{currency} {price}",
                        "price_per_person": price_per_person,
                        "departure": departure_time,
                        "arrival": arrival_time,
                        "duration": duration,
                        "stops": len(segments) - 1 if segments else 0,
                        "travel_class": travel_class,
                        "trip_type": trip_type
                    }
                    
                    # Add affiliate booking link if configured
                    travelpayouts_token = os.getenv('TRAVELPAYOUTS_TOKEN')
                    if travelpayouts_token and not travelpayouts_token.startswith('your_'):
                        # Generate Travelpayouts affiliate link
                        base_url = os.getenv('AFFILIATE_BASE_URL', 'https://www.aviasales.com')
                        flight_info['booking_url'] = f"{base_url}/search/{origin}{departure_date[:4]}{departure_date[5:7]}{departure_date[8:10]}{destination}1?marker={os.getenv('TRAVELPAYOUTS_MARKER', '')}"
                    
                    flights.append(flight_info)
                except Exception as parse_error:
                    logger.error(f"Error parsing flight offer {idx}: {parse_error}")
                    logger.error(f"Offer data type: {type(offer)}")
                    if isinstance(offer, dict):
                        logger.error(f"Offer keys: {list(offer.keys())[:5]}...")  # Log first 5 keys for debugging
                    continue
            
            return {
                "endpoint": "flight_search",
                "method": "POST",
                "response": {
                    "origin": origin,
                    "destination": destination,
                    "departure_date": departure_date,
                    "return_date": return_date,
                    "flights": flights,
                    "total_results": len(flights),
                    "passengers": {
                        "adults": adults,
                        "children": children,
                        "infants": infants,
                        "total": adults + children + infants
                    },
                    "search_criteria": {
                        "travel_class": travel_class,
                        "nonstop_only": nonstop_only,
                        "max_price": max_price,
                        "trip_type": trip_type
                    },
                    "message": f"Found {len(flights)} {travel_class.lower()} {'non-stop ' if nonstop_only else ''}flights from {origin} to {destination} for {adults + children + infants} passenger(s)"
                },
                "timestamp": datetime.now().isoformat(),
                "status": "success"
            }
            
        except Exception as e:
            logger.error(f"Flight search error: {e}")
            return {
                "endpoint": "flight_search",
                "error": f"An error occurred during flight search: {str(e)}",
                "status": "error"
            }
    
    async def send_to_client(self, session_id: str, message: dict):
        """Send message to connected client"""
        if session_id in self.client_connections:
            client_ws = self.client_connections[session_id]
            # Check if WebSocket is still open using application state
            if client_ws and client_ws.application_state == WebSocketState.CONNECTED:
                await client_ws.send(json.dumps(message))
    
    async def handle_client_message(self, session_id: str, message: dict):
        """Handle messages from web client"""
        msg_type = message.get("type")
        
        if msg_type == "audio.input":
            # Convert and forward audio to OpenAI
            await self.forward_audio_to_openai(message.get("audio"), message.get("format"), session_id)
            
        elif msg_type == "text.input":
            # Send text message to OpenAI
            await self.send_text_to_openai(message.get("text"))
            
        elif msg_type == "rag.index":
            # Index new document in RAG
            await self.index_document(message.get("fileId"), message.get("content"))
            
        elif msg_type == "session.config":
            # Update session configuration
            if message.get("config", {}).get("enableFunctions"):
                await self.configure_openai_session()
        
        elif msg_type == "update_settings":
            # Update voice settings in real-time
            settings = message.get("settings", {})
            if self.openai_ws:
                try:
                    # Build updated session configuration
                    selected_voice = settings.get("voice", "alloy")
                    selected_temp = settings.get("temperature", 0.7) if settings.get("temperature") is not None else 0.7
                    custom_instructions = settings.get("instructions", "")
                    
                    # Build instructions with custom additions
                    api_instructions = self.get_api_instructions()
                    base_instructions = f"""You are a helpful AI assistant with FULL ACCESS to a knowledge base through the search_knowledge_base function.
                    
                    CRITICAL: You MUST ALWAYS use the search_knowledge_base function when users mention:
                    - Files, documents, resumes, PDFs, or any uploaded content
                    - Names, details, or information from documents
                    - "What's in the file", "tell me about", "review", "check", "look at"
                    - ANY questions about uploaded content
                    
                    You have the following functions available:
                    1. search_knowledge_base - Search through uploaded documents for relevant information
                    2. execute_workflow - Execute multi-step workflows
                    3. call_external_api - Call external APIs{api_instructions}
                    
                    NEVER say you cannot access files. You CAN access them through search_knowledge_base.
                    ALWAYS search first, then provide answers based on the results.
                    - If no results are found, explain that the information is not in the knowledge base"""
                    
                    # Add custom instructions
                    if custom_instructions:
                        base_instructions = f"{base_instructions}\n\nAdditional instructions: {custom_instructions}"
                    
                    # Send session.update to OpenAI
                    session_update = {
                        "type": "session.update",
                        "session": {
                            "voice": selected_voice,
                            "instructions": base_instructions,
                            "temperature": selected_temp
                        }
                    }
                    
                    await self.openai_ws.send(json.dumps(session_update))
                    logger.info(f"Sent session.update to OpenAI: voice={selected_voice}, temp={selected_temp}")
                    
                    # Send confirmation to client
                    await self.send_to_client(session_id, {
                        "type": "settings_updated",
                        "settings": settings
                    })
                except Exception as e:
                    import traceback
                    logger.error(f"Error updating settings: {e}")
                    logger.error(f"Traceback: {traceback.format_exc()}")
        
        elif msg_type == "reset_audio_state":
            # Reset audio buffer on the server side
            logger.info("Resetting audio state for new recording session")
            # Send a commit buffer to clear any pending audio
            if self.openai_ws:
                await self.openai_ws.send(json.dumps({
                    "type": "input_audio_buffer.clear"
                }))
        
        elif msg_type == "recording_stopped":
            # Commit any buffered audio when recording stops
            logger.info("Recording stopped, committing audio buffer")
            if self.openai_ws:
                await self.openai_ws.send(json.dumps({
                    "type": "input_audio_buffer.commit"
                }))
    
    async def forward_audio_to_openai(self, audio_base64: str, audio_format: str = None, session_id: str = None):
        """Forward audio from client to OpenAI"""
        if not self.openai_ws:
            return
        
        try:
            # For now, skip WebM audio as it requires conversion
            # OpenAI expects PCM16 audio at 24kHz
            if audio_format == 'webm':
                logger.warning("WebM audio format not supported yet - need PCM16")
                # Tell client to use PCM16 format
                await self.send_to_client(session_id, {
                    "type": "audio_format_error",
                    "message": "Please use PCM16 audio format at 24kHz"
                })
                return
            
            # Only send if we have PCM16 audio
            if audio_format == 'pcm16' or not audio_format:
                audio_message = {
                    "type": "input_audio_buffer.append",
                    "audio": audio_base64
                }
                
                await self.openai_ws.send(json.dumps(audio_message))
                
                # Commit audio buffer
                await self.openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
            
        except Exception as e:
            logger.error(f"Audio forwarding error: {e}")
            if session_id:
                await self.send_to_client(session_id, {
                    "type": "error",
                    "error": f"Audio processing error: {str(e)}"
                })
    
    async def send_text_to_openai(self, text: str):
        """Send text message to OpenAI"""
        if not self.openai_ws:
            return
        
        message = {
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": text
                    }
                ]
            }
        }
        
        await self.openai_ws.send(json.dumps(message))
        
        # Request response
        await self.openai_ws.send(json.dumps({"type": "response.create"}))
    
    async def index_document(self, file_id: str, content: str, filename: str = None):
        """Index document in RAG system"""
        try:
            # Split content into chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200
            )
            
            chunks = text_splitter.split_text(content)
            
            # Create documents with metadata
            documents = [
                Document(
                    page_content=chunk,
                    metadata={
                        "file_id": file_id, 
                        "chunk_index": i,
                        "filename": filename or file_id,
                        "total_chunks": len(chunks)
                    }
                )
                for i, chunk in enumerate(chunks)
            ]
            
            # Add to vector store
            if self.rag_store:
                self.rag_store.add_documents(documents)
                # Chroma auto-persists in newer versions
                
            logger.info(f"Indexed {len(chunks)} chunks for file {file_id}")
            
            return len(chunks)
            
        except Exception as e:
            logger.error(f"Document indexing error: {e}")
            return 0

# FastAPI application
app = FastAPI(title="VoiceBot Demo Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global proxy instance
proxy = RealtimeAPIProxy()

# Store for uploaded files
uploaded_files = {}

# Health check endpoint for AWS
@app.get("/health")
async def health_check():
    """Health check endpoint for load balancers and monitoring"""
    try:
        # Check if we can connect to OpenAI (optional)
        has_api_key = bool(proxy.api_key)
        
        # Check if RAG store is initialized
        rag_initialized = proxy.rag_store is not None
        
        return {
            "status": "healthy",
            "service": "VoiceBot Demo Server",
            "timestamp": datetime.now().isoformat(),
            "checks": {
                "openai_configured": has_api_key,
                "rag_initialized": rag_initialized,
                "server_running": True
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unavailable")

# API endpoints for configuration management
@app.get("/api/endpoints")
async def get_api_endpoints():
    """Get all API endpoint configurations"""
    return proxy.api_config

@app.post("/api/endpoints")
async def update_api_endpoints(config: dict):
    """Update API endpoint configurations"""
    try:
        # Save to file
        config_path = "./data/api_config.json"
        os.makedirs("./data", exist_ok=True)
        
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        # Update proxy configuration
        proxy.api_config = config
        
        logger.info(f"Updated API configuration with {len(config.get('endpoints', []))} endpoints")
        return {"status": "success", "message": "API configuration updated"}
    except Exception as e:
        logger.error(f"Failed to update API configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/call")
async def call_api_endpoint(request: dict):
    """Handle external API calls through the server"""
    try:
        endpoint = request.get("endpoint")
        params = request.get("params", {})
        
        if not endpoint:
            raise HTTPException(status_code=400, detail="Missing 'endpoint' parameter")
        
        # Call the API through the proxy
        result = await proxy.call_api(endpoint, "GET", params)
        return result
    except Exception as e:
        logger.error(f"API call failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/rtc")
async def rtc_endpoint(websocket: WebSocket):
    """RTC WebSocket endpoint for ultra-low latency mode"""
    try:
        await websocket.accept()
        session_id = str(uuid.uuid4())
        proxy.client_connections[session_id] = websocket
        
        logger.info(f"RTC client connected: {session_id}")
        
        # Send initial connection acknowledgment
        await websocket.send_json({"type": "rtc_ready", "session_id": session_id})
        
        # Connect to OpenAI with RTC-optimized settings
        if await proxy.connect_to_openai(session_id, rtc_mode=True):
            await websocket.send_json({"type": "connected", "session_id": session_id})
            
            try:
                # Handle bidirectional communication
                client_task = asyncio.create_task(handle_rtc_client_messages(websocket, session_id))
                openai_task = asyncio.create_task(handle_openai_messages(websocket, session_id))
                
                await asyncio.gather(client_task, openai_task)
                
            except Exception as e:
                logger.error(f"RTC WebSocket error: {e}")
            finally:
                if proxy.openai_ws:
                    await proxy.openai_ws.close()
                if session_id in proxy.client_connections:
                    del proxy.client_connections[session_id]
                logger.info(f"RTC client disconnected: {session_id}")
        else:
            await websocket.send_json({"type": "error", "error": "Failed to connect to OpenAI"})
            await websocket.close()
    except Exception as e:
        logger.error(f"RTC endpoint error: {e}")
        await websocket.close()

async def handle_rtc_client_messages(websocket: WebSocket, session_id: str):
    """Handle binary audio messages from RTC client"""
    try:
        while True:
            data = await websocket.receive()
            
            if 'bytes' in data:
                # Binary audio data from RTC client
                audio_bytes = data['bytes']
                
                # Convert to base64 and send to OpenAI
                audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                
                message = {
                    "type": "input_audio_buffer.append",
                    "audio": audio_base64
                }
                
                if proxy.openai_ws:
                    await proxy.openai_ws.send(json.dumps(message))
                    
            elif 'text' in data:
                # Text message (control commands)
                message = json.loads(data['text'])
                await proxy.handle_client_message(session_id, message)
                
    except Exception as e:
        logger.error(f"RTC client message handler error: {e}")

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
        
        # Handle bidirectional communication
        try:
            # Create tasks for handling messages from both directions
            client_task = asyncio.create_task(handle_client_messages(websocket, session_id))
            openai_task = asyncio.create_task(handle_openai_messages(websocket, session_id))
            
            # Wait for either task to complete
            await asyncio.gather(client_task, openai_task)
            
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            # Cleanup
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
            await proxy.handle_client_message(session_id, message)
    except Exception as e:
        logger.error(f"Client message handler error: {e}")

async def handle_openai_messages(websocket: WebSocket, session_id: str):
    """Handle messages from OpenAI and forward to client"""
    # Track the last user transcript for this session
    last_user_transcript = ""
    pending_user_transcript = False
    
    try:
        async for message in proxy.openai_ws:
            data = json.loads(message)
            event_type = data.get("type")
            
            # Debug: Log all events to see what we're receiving
            if event_type not in ["response.audio.delta", "response.audio_transcript.delta", "input_audio_buffer.speech_started", "input_audio_buffer.speech_stopped"]:
                logger.debug(f"OpenAI event: {event_type}")
            
            # Handle different event types
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
                # When assistant starts responding, send the final user transcript first
                if pending_user_transcript and last_user_transcript:
                    await websocket.send_json({
                        "type": "transcription.complete",
                        "text": last_user_transcript,
                        "role": "user"
                    })
                    logger.info(f"User said (from partial): {last_user_transcript}")
                    pending_user_transcript = False
                
                # Send assistant transcription delta for real-time display
                await websocket.send_json({
                    "type": "transcription",
                    "text": data.get("delta", ""),
                    "role": "assistant"
                })
                
            elif event_type == "response.audio_transcript.done":
                # Complete assistant transcription
                transcript = data.get("transcript", "")
                if transcript:
                    await websocket.send_json({
                        "type": "transcription.complete",
                        "text": transcript,
                        "role": "assistant"
                    })
                    logger.info(f"Assistant response: {transcript}")
                
            elif event_type == "response.created":
                # Response is being created - send the pending user transcript now
                if pending_user_transcript and last_user_transcript:
                    await websocket.send_json({
                        "type": "transcription.complete",
                        "text": last_user_transcript,
                        "role": "user"
                    })
                    logger.info(f"User said (on response created): {last_user_transcript}")
                    pending_user_transcript = False
                
                response_data = data.get("response", {})
                if response_data:
                    # Get the output items to find what user said
                    output_items = response_data.get("output", [])
                    for item_id in output_items:
                        # We'll need to track this to get the user message
                        logger.debug(f"Response created with output items: {output_items}")
                    
                    # Also check if there's a status with input tokens which indicates user input
                    status = response_data.get("status")
                    if status:
                        logger.debug(f"Response status: {status}")
                
            elif event_type == "response.done":
                # Response completed
                response = data.get("response", {})
                
                # Try to extract user input from the response
                if response:
                    # Get usage info which might contain input tokens (user's message)
                    usage = response.get("usage", {})
                    if usage:
                        input_tokens = usage.get("input_tokens", 0)
                        if input_tokens > 0:
                            logger.debug(f"Response used {input_tokens} input tokens")
                    
                    # Look for output items to extract conversation context
                    output_items = response.get("output", [])
                    for item_id in output_items:
                        logger.debug(f"Output item in response.done: {item_id}")
                
                await websocket.send_json({
                    "type": "response.done"
                })
                
            elif event_type == "response.content_part.done":
                # Content part completed
                part = data.get("part", {})
                if part.get("type") == "audio":
                    await websocket.send_json({
                        "type": "audio.done"
                    })
                
            elif event_type == "conversation.item.input_audio_transcription.completed":
                # Complete transcription of user input
                item = data.get("item", {})
                content = item.get("content", [])
                transcript = ""
                
                # Extract transcript from content
                for c in content:
                    if c.get("type") == "input_audio" and c.get("transcript"):
                        transcript = c.get("transcript")
                        break
                
                # Fallback to direct transcript field
                if not transcript:
                    transcript = data.get("transcript", "")
                
                if transcript:
                    await websocket.send_json({
                        "type": "transcription.complete",
                        "text": transcript,
                        "role": "user"
                    })
                    logger.info(f"User transcription complete: {transcript}")
                
            elif event_type == "conversation.item.created":
                # New conversation item created
                item = data.get("item", {})
                if item.get("role") == "user":
                    # Check for user input transcription
                    content = item.get("content", [])
                    for c in content:
                        if c.get("type") == "input_audio" and c.get("transcript"):
                            transcript = c.get("transcript")
                            if transcript:
                                await websocket.send_json({
                                    "type": "transcription.complete",
                                    "text": transcript,
                                    "role": "user"
                                })
                                logger.info(f"User said: {transcript}")
                            break
                
            elif event_type == "conversation.item.input_audio_transcription.partial":
                # Partial transcription of user input (real-time)
                partial_transcript = data.get("transcript", "")
                if partial_transcript:
                    # Store the last partial transcript
                    last_user_transcript = partial_transcript
                    pending_user_transcript = True
                    
                    await websocket.send_json({
                        "type": "transcription.partial",
                        "text": partial_transcript,
                        "role": "user"
                    })
                    logger.debug(f"User partial: {partial_transcript}")  # Use debug to reduce log noise
                
            elif event_type == "response.function_call_arguments.done":
                # Handle function calls
                function_name = data.get("name")
                call_id = data.get("call_id")
                arguments = json.loads(data.get("arguments", "{}"))
                
                # Notify client about function call
                await websocket.send_json({
                    "type": "function_call",
                    "name": function_name,
                    "arguments": arguments
                })
                
                # Execute the function
                await proxy.handle_function_call(function_name, arguments, session_id, call_id)
                
            elif event_type == "response.output_item.added":
                # Check if it's a function call
                item = data.get("item", {})
                if item.get("type") == "function_call":
                    function_name = item.get("name")
                    logger.info(f"Function call started: {function_name}")
                    
            elif event_type == "response.function_call_arguments.delta":
                # Accumulate function arguments
                pass  # We'll handle the complete arguments in the done event
                
            elif event_type == "input_audio_buffer.speech_started":
                # User started speaking - might interrupt AI
                await websocket.send_json({
                    "type": "speech_started"
                })
                logger.info("User started speaking")
                
            elif event_type == "input_audio_buffer.speech_stopped":
                # User stopped speaking
                # Mark that we should send the transcript when AI responds
                if last_user_transcript:
                    pending_user_transcript = True
                    
                await websocket.send_json({
                    "type": "speech_stopped"
                })
                logger.info("User stopped speaking")
                
            elif event_type == "conversation.item.truncated":
                # AI response was interrupted
                await websocket.send_json({
                    "type": "response_interrupted"
                })
                logger.info("AI response was interrupted")
                
            elif event_type == "response.cancelled":
                # Response was cancelled due to interruption
                await websocket.send_json({
                    "type": "response_cancelled"
                })
                logger.info("Response cancelled")
                
            elif event_type == "error":
                # Log the error but don't always forward to client
                error_msg = data.get("error", {}).get("message", "Unknown error")
                logger.debug(f"OpenAI error: {error_msg}")
                # Only forward critical errors to client
                if "critical" in error_msg.lower() or "failed" in error_msg.lower():
                    await websocket.send_json({
                        "type": "error",
                        "error": error_msg,
                        "internal": True
                    })
                
    except Exception as e:
        logger.error(f"OpenAI message handler error: {e}")

# Move upload endpoint before static files
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads for RAG"""
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
            
        file_id = str(uuid.uuid4())
        content = await file.read()
        
        # Check if file is empty
        if not content:
            raise HTTPException(status_code=400, detail="File is empty")
        
        # Process based on file type
        text_content = ""
        
        if file.filename.endswith('.pdf'):
            # Extract text from PDF
            import io
            try:
                pdf_reader = PdfReader(io.BytesIO(content))
                total_pages = len(pdf_reader.pages)
                successful_pages = 0
                
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            # Clean up the text to avoid encoding issues
                            # Replace common problematic characters
                            page_text = page_text.replace('\u2019', "'")  # Right single quote
                            page_text = page_text.replace('\u2018', "'")  # Left single quote
                            page_text = page_text.replace('\u201c', '"')  # Left double quote
                            page_text = page_text.replace('\u201d', '"')  # Right double quote
                            page_text = page_text.replace('\u2013', '-')  # En dash
                            page_text = page_text.replace('\u2014', '--') # Em dash
                            page_text = page_text.replace('\u2026', '...') # Ellipsis
                            
                            # Remove any remaining non-ASCII characters
                            page_text = ''.join(char if ord(char) < 128 else ' ' for char in page_text)
                            
                            if page_text.strip():
                                text_content += page_text + "\n"
                                successful_pages += 1
                    except Exception as page_error:
                        logger.warning(f"Failed to extract text from page {page_num + 1}: {page_error}")
                        # Continue with other pages even if one fails
                        continue
                
                logger.info(f"Extracted text from {successful_pages}/{total_pages} pages")
                
                # If no text was extracted, it might be a scanned PDF
                if not text_content.strip():
                    logger.warning(f"No text extracted from PDF: {file.filename} - might be scanned/image-based")
                    text_content = f"PDF file: {file.filename}\nNote: This appears to be a scanned or image-based PDF. Text extraction was not successful. The file may contain images, charts, or scanned documents that require OCR processing."
                    
            except Exception as pdf_error:
                error_msg = str(pdf_error)
                # Handle encoding errors in error message itself
                try:
                    logger.error(f"PDF processing error: {error_msg}")
                except:
                    logger.error("PDF processing error with non-ASCII characters")
                
                # Try to provide a more helpful error message
                if "EOF marker not found" in error_msg:
                    raise HTTPException(status_code=400, detail="PDF file appears to be corrupted or incomplete")
                elif "invalid" in error_msg.lower():
                    raise HTTPException(status_code=400, detail="Invalid PDF file format")
                elif "codec" in error_msg or "decode" in error_msg:
                    raise HTTPException(status_code=400, detail="PDF contains special characters that couldn't be processed. This may be a scanned or image-based PDF.")
                else:
                    # Don't include the original error message if it has encoding issues
                    raise HTTPException(status_code=400, detail="Failed to process PDF. The file may be corrupted or in an unsupported format.")
                
        elif file.filename.endswith(('.txt', '.md', '.log', '.csv', '.tsv', '.xml', '.html', '.htm', '.rtf')):
            try:
                text_content = content.decode('utf-8')
            except UnicodeDecodeError:
                # Try with different encoding
                try:
                    text_content = content.decode('latin-1')
                except:
                    raise HTTPException(status_code=400, detail="Failed to decode text file")
            
        elif file.filename.endswith('.json'):
            try:
                json_data = json.loads(content)
                text_content = json.dumps(json_data, indent=2)
            except json.JSONDecodeError as json_error:
                raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(json_error)}")
        
        elif file.filename.endswith(('.doc', '.docx')):
            # For Word documents, provide basic support
            text_content = f"Word document: {file.filename}\nNote: Full text extraction from Word documents requires additional libraries. File has been indexed with metadata.\nFile size: {len(content)} bytes"
        
        elif file.filename.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff')):
            # Process image with GPT-4o-mini Vision
            try:
                # Convert image to base64
                image_base64 = base64.b64encode(content).decode('utf-8')
                
                # Determine MIME type
                mime_type = "image/jpeg"  # default
                if file.filename.lower().endswith('.png'):
                    mime_type = "image/png"
                elif file.filename.lower().endswith('.gif'):
                    mime_type = "image/gif"
                elif file.filename.lower().endswith('.webp'):
                    mime_type = "image/webp"
                
                # Call GPT-4o-mini Vision API to analyze the image
                logger.info(f"Analyzing image {file.filename} with GPT-4o-mini Vision...")
                
                response = proxy.openai_client.chat.completions.create(
                    model="gpt-4o-mini",  # Using the cost-effective model
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Describe this image in detail including: objects, people, text (OCR), colors, context, and any notable features. Be thorough for search purposes."
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{image_base64}",
                                        "detail": "auto"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=500
                )
                
                # Extract the description
                image_description = response.choices[0].message.content
                
                # Create text content for RAG
                text_content = f"""Image: {file.filename}

AI Vision Analysis:
{image_description}

Metadata:
- Filename: {file.filename}
- Type: {mime_type}
- Size: {len(content):,} bytes
- Uploaded: {datetime.now().isoformat()}

This image has been analyzed using AI vision for semantic search."""
                
                logger.info(f"Successfully analyzed image {file.filename}")
                
            except Exception as img_error:
                logger.error(f"Failed to analyze image: {img_error}")
                # Fallback to basic metadata
                text_content = f"""Image: {file.filename}

Note: Vision analysis unavailable. Basic metadata indexed.

Metadata:
- Filename: {file.filename}
- Size: {len(content):,} bytes
- Uploaded: {datetime.now().isoformat()}"""
        
        else:
            # Try to decode as plain text for unknown file types
            try:
                text_content = content.decode('utf-8')
                logger.info(f"Unknown file type {file.filename} - treating as plain text")
            except:
                try:
                    text_content = content.decode('latin-1')
                except:
                    raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.filename}. Unable to decode as text.")
        
        # Check if we got any text
        if not text_content or not text_content.strip():
            raise HTTPException(status_code=400, detail="No text content found in file")
        
        # Store file info
        uploaded_files[file_id] = {
            "filename": file.filename,
            "content": text_content,
            "upload_time": datetime.now().isoformat()
        }
        
        # Index in RAG
        chunks = await proxy.index_document(file_id, text_content, file.filename)
        
        logger.info(f"Successfully uploaded file: {file.filename} ({chunks} chunks)")
        
        return JSONResponse({
            "fileId": file_id,
            "fileName": file.filename,
            "chunks": chunks,
            "status": "success"
        })
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.delete("/api/file/{file_id}")
async def delete_file(file_id: str):
    """Remove file from RAG"""
    # First check in-memory store
    if file_id in uploaded_files:
        del uploaded_files[file_id]
    
    # Always try to delete from ChromaDB regardless of in-memory state
    try:
        if proxy.rag_store:
            collection = proxy.rag_store._collection
            
            # Delete all documents with this file_id
            collection.delete(
                where={"file_id": file_id}
            )
            
            logger.info(f"Deleted file {file_id} from RAG store")
            return JSONResponse({"status": "success", "message": f"File {file_id} deleted from RAG"})
        else:
            # If no RAG store but file was in memory, still return success
            if file_id in uploaded_files:
                return JSONResponse({"status": "success", "message": "File deleted from memory"})
            else:
                raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        logger.error(f"Error deleting file {file_id}: {e}")
        # If deletion failed but file was in memory, still report partial success
        if file_id in uploaded_files:
            return JSONResponse({"status": "partial_success", "message": "Deleted from memory but not from RAG"})
        else:
            raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")

@app.get("/api/rag/files")
async def list_rag_files():
    """List all files currently in the RAG system"""
    try:
        files_dict = {}  # Use dict to track unique files
        
        # Query the RAG store directly for all documents
        if proxy.rag_store:
            try:
                collection = proxy.rag_store._collection
                
                # Get all documents with their metadata
                # ChromaDB get() without ids returns all documents
                all_docs = collection.get(
                    include=["metadatas"]
                )
                
                # Process metadata to extract unique files
                if all_docs and "metadatas" in all_docs:
                    for metadata in all_docs["metadatas"]:
                        if metadata:
                            file_id = metadata.get("file_id", "")
                            filename = metadata.get("filename", "unknown")
                            
                            # Track unique files and count chunks
                            if file_id and file_id not in files_dict:
                                files_dict[file_id] = {
                                    "fileId": file_id,
                                    "fileName": filename,
                                    "chunks": 1,
                                    "uploadTime": ""  # Not stored in metadata currently
                                }
                            elif file_id:
                                files_dict[file_id]["chunks"] += 1
                
                logger.info(f"Found {len(files_dict)} unique files with {collection.count()} total chunks in RAG store")
                
                # Also add any files from memory that might not be persisted yet
                for file_id, file_info in uploaded_files.items():
                    if file_id not in files_dict:
                        files_dict[file_id] = {
                            "fileId": file_id,
                            "fileName": file_info.get("filename", "unknown"),
                            "uploadTime": file_info.get("upload_time", ""),
                            "chunks": 5  # Estimate
                        }
                
            except Exception as e:
                logger.error(f"Error querying RAG store: {e}")
                import traceback
                logger.error(traceback.format_exc())
        
        # Convert dict to list
        files = list(files_dict.values())
        
        return JSONResponse(files)
        
    except Exception as e:
        logger.error(f"Error listing RAG files: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return JSONResponse([])

# Mount docs directory for documentation
app.mount("/docs", StaticFiles(directory="docs"), name="docs")

# Mount static files only at the root, API routes are defined above
app.mount("/", StaticFiles(directory="public", html=True), name="static")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    ws_port = int(os.getenv("WS_PORT", 3001))
    
    logger.info(f"Starting VoiceBot Demo Server on port {port}")
    logger.info(f"WebSocket server on port {ws_port}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )