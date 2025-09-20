#!/bin/bash

echo "🚀 VoiceBot Demo Launcher"
echo "========================="

# Check for .env file
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env
    echo "📝 Please edit .env and add your OPENAI_API_KEY"
    echo "   Then run this script again."
    exit 1
fi

# Check for API key
if ! grep -q "OPENAI_API_KEY=sk" .env; then
    echo "⚠️  OPENAI_API_KEY not configured in .env"
    echo "📝 Please add your OpenAI API key to .env file"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
REQUIRED_VERSION="3.8"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then 
    echo "⚠️  Python $REQUIRED_VERSION or higher is required (found $PYTHON_VERSION)"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install/update dependencies
echo "📚 Installing dependencies..."
echo "   This may take a few minutes on first run..."
pip install -q --upgrade pip

# Install core dependencies first
echo "   📦 Installing core dependencies..."
pip install -q websockets python-dotenv aiohttp numpy

# Install FastAPI and server dependencies
echo "   🚀 Installing FastAPI server dependencies..."
pip install -q fastapi uvicorn python-multipart

# Install OpenAI SDK
echo "   🤖 Installing OpenAI SDK..."
pip install -q openai

# Install RAG dependencies
echo "   📚 Installing RAG and vector database dependencies..."
pip install -q langchain langchain-openai langchain-community chromadb tiktoken PyPDF2

# Install optional but recommended dependencies
echo "   🔧 Installing optional dependencies..."
pip install -q redis python-json-logger rich || true

# Create necessary directories
mkdir -p public
mkdir -p data/chroma_db
mkdir -p logs

echo ""
echo "🧪 Testing OpenAI connection..."
echo "================================"

# Run connection test (don't fail on websocket version issues)
python test_basic.py 2>&1 | tee /tmp/test_output.txt

if grep -q "All tests passed" /tmp/test_output.txt; then
    echo ""
    echo "✅ All systems operational!"
elif grep -q "WebSocket library version issue" /tmp/test_output.txt; then
    echo ""
    echo "⚠️  WebSocket version compatibility issue detected"
    echo "   The server should still work correctly"
    echo "✅ Proceeding with startup..."
else
    echo ""
    echo "⚠️  Some tests failed. Possible issues:"
    echo "   1. Your OpenAI API key might be invalid"
    echo "   2. You may not have access to the Realtime API (requires Tier 1+)"
    echo "   3. Some dependencies might be missing"
    echo ""
    echo "You can still proceed to test the interface."
    echo "Continue anyway? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

rm -f /tmp/test_output.txt

echo ""
echo "🎙️  Starting VoiceBot Demo Server..."
echo "===================================="
echo ""
echo "📡 Server will start on:"
echo "   Web Interface: http://localhost:3000"
echo "   Admin Dashboard: http://localhost:3000/admin.html"
echo "   WebSocket: ws://localhost:3000/ws"
echo ""
echo "📋 Instructions:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Upload documents to the knowledge base"
echo "   3. Click the microphone to start talking"
echo "   4. Watch real-time API orchestration in action!"
echo ""
echo "⚙️  Admin Features:"
echo "   - Configure workflows at http://localhost:3000/admin.html"
echo "   - Drag-and-drop workflow designer"
echo "   - Real-time testing console"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Check for ultra-low latency mode
if [ "$1" = "rtc" ] || [ "$1" = "ultra" ]; then
    echo "⚡ Starting Ultra-Low Latency RTC Server..."
    echo "   This mode achieves <100ms latency like ChatGPT app"
    python src/realtime_rtc_server.py
elif grep -q "OPENAI_API_KEY=sk" .env; then
    echo "📡 Starting OpenAI Realtime server with voice and API orchestration..."
    echo "   For ultra-low latency mode, run: ./run.sh rtc"
    python src/realtime_demo_server.py
else
    echo "📡 Starting demo server (OpenAI key not configured)..."
    echo "   Note: Voice features require OpenAI API key"
    python src/demo_server.py
fi