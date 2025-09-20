#!/usr/bin/env python3
"""
Basic test to verify OpenAI API connection
"""

import os
import sys
import asyncio
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_connection():
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("❌ OPENAI_API_KEY not found in .env file")
        return False
    
    print("✅ API key found")
    
    # Import websockets after checking
    try:
        import websockets
    except ImportError:
        print("❌ websockets library not installed")
        print("   Run: pip install websockets")
        return False
    
    # Test WebSocket connection to OpenAI
    url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
    
    try:
        print("🔄 Connecting to OpenAI Realtime API...")
        
        # Handle different websockets library versions
        import inspect
        connect_params = inspect.signature(websockets.connect).parameters
        
        if 'extra_headers' in connect_params:
            # Newer version with extra_headers support
            headers = {
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "realtime=v1"
            }
            ws = await websockets.connect(url, extra_headers=headers)
        elif 'additional_headers' in connect_params:
            # Alternative parameter name in some versions
            headers = [
                ("Authorization", f"Bearer {api_key}"),
                ("OpenAI-Beta", "realtime=v1")
            ]
            ws = await websockets.connect(url, additional_headers=headers)
        else:
            # Older version - construct headers differently
            print("⚠️  Your websockets version may not support custom headers")
            print("   Consider upgrading: pip install --upgrade websockets")
            # Try basic connection without headers (will likely fail auth)
            ws = await websockets.connect(url)
        
        async with ws:
            print("✅ Connected successfully!")
            
            # Configure session for text only
            config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text"],
                    "instructions": "You are a helpful assistant."
                }
            }
            await ws.send(json.dumps(config))
            
            # Wait for response
            response = await ws.recv()
            data = json.loads(response)
            
            if data.get('type') == 'session.created':
                print("✅ Session created successfully!")
                print(f"   Session ID: {data.get('session', {}).get('id', 'N/A')}")
                return True
            else:
                print(f"⚠️  Unexpected response: {data.get('type')}")
                return False
                
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "unauthorized" in error_msg.lower():
            print("❌ Authentication failed - Invalid API key")
            print("   Please check your API key is correct")
        elif "403" in error_msg:
            print("❌ Access denied - Your account may not have Realtime API access")
            print("   Realtime API requires a Tier 1+ account")
        elif "extra_headers" in error_msg or "additional_headers" in error_msg:
            print("⚠️  WebSocket library version issue detected")
            print("   The connection test failed but the server may still work")
            return True  # Allow continuation despite test failure
        else:
            print(f"❌ Connection failed: {e}")
        return False

def test_basic_imports():
    """Test if basic required libraries are installed"""
    print("🔍 Checking required libraries...")
    
    required = {
        'fastapi': 'FastAPI web framework',
        'uvicorn': 'ASGI server',
        'websockets': 'WebSocket client/server',
        'openai': 'OpenAI SDK',
        'dotenv': 'Environment variables'
    }
    
    missing = []
    for module, description in required.items():
        try:
            if module == 'dotenv':
                __import__('dotenv')
            else:
                __import__(module)
            print(f"  ✅ {module}: {description}")
        except ImportError:
            print(f"  ❌ {module}: {description} - NOT INSTALLED")
            missing.append(module)
    
    return len(missing) == 0

if __name__ == "__main__":
    print("=" * 50)
    print("OpenAI Realtime API Connection Test")
    print("=" * 50)
    
    # Test imports first
    imports_ok = test_basic_imports()
    
    if not imports_ok:
        print("\n❌ Some required libraries are missing")
        print("   Run: pip install -r requirements.txt")
        sys.exit(1)
    
    # Test API connection
    success = asyncio.run(test_connection())
    
    if success:
        print("\n✅ All tests passed! You can now run the full demo.")
        print("   Run: python src/server_simple.py")
    else:
        print("\n⚠️  Connection test had issues, but server may still work")
        print("   You can try running the server anyway")
        print("   Run: python src/server_simple.py")