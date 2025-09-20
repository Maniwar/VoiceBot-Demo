# Quick Start Guide - OpenAI Realtime Voice Bot

## Prerequisites
- Python 3.8+ or Node.js 18+
- OpenAI API Key with Realtime API access (Tier 1+ account)
- macOS, Linux, or Windows with WSL

## Setup Instructions

### 1. Clone and Setup Environment

```bash
# Clone the repository
cd VoiceBot-Demo

# Copy environment variables
cp .env.example .env

# Edit .env and add your OpenAI API key
# OPENAI_API_KEY=sk-your-api-key-here
```

### 2. Automatic Setup (Recommended)

```bash
# Run the automated setup and launch script
./run.sh

# This will:
# - Create virtual environment
# - Install all dependencies
# - Test OpenAI connection
# - Start the server
```

### 3. Manual Setup (Alternative)

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate  # On Windows

# Install all dependencies at once
pip install websockets python-dotenv fastapi uvicorn python-multipart \
            openai langchain langchain-openai langchain-community \
            chromadb tiktoken PyPDF2 numpy redis

# OR install minimal dependencies for testing
pip install websockets python-dotenv openai
```

### 4. Run Basic Tests

#### Test 1: Simple Text Communication
```bash
python src/test_realtime_simple.py
```

Expected output:
- Connects to OpenAI Realtime API
- Sends text messages
- Receives text responses
- Tests basic conversation flow

#### Test 2: Audio Communication
```bash
python src/test_realtime_audio.py
```

Expected output:
- Connects with audio configuration
- Sends text, receives audio response
- Saves audio responses as .wav files
- Tests voice capabilities

### 4. Node.js Alternative Setup

```bash
# Install dependencies
npm install

# Run Node.js test (create this file first)
node src/test_realtime.js
```

## What's Working

✅ **Basic Connectivity**
- WebSocket connection to OpenAI Realtime API
- Authentication with API key
- Session configuration

✅ **Text Mode**
- Send text messages
- Receive text responses
- Conversation management

✅ **Audio Mode**
- Configure audio parameters (PCM16, 24kHz)
- Receive audio responses
- Save audio to WAV files
- Voice Activity Detection (VAD) configuration

## Next Steps

### Immediate Tasks
1. **Test Your Connection**
   ```bash
   # Run this first to verify API access
   python src/test_realtime_simple.py
   ```

2. **Check Audio Capabilities**
   ```bash
   python src/test_realtime_audio.py
   # Look for .wav files created in the current directory
   ```

### Development Path

#### Phase 1: Basic Integration (Current)
- [x] WebSocket connection
- [x] Text communication
- [x] Audio response handling
- [ ] Microphone input integration
- [ ] Real-time audio playback

#### Phase 2: RAG Integration
- [ ] Set up vector database (ChromaDB)
- [ ] Document ingestion pipeline
- [ ] Retrieval function calling
- [ ] Context injection

#### Phase 3: Production Features
- [ ] Web interface with WebRTC
- [ ] Session management
- [ ] API orchestration
- [ ] Error recovery
- [ ] Monitoring and logging

## Troubleshooting

### Connection Issues
```bash
# Check API key is set
echo $OPENAI_API_KEY

# Verify Python packages
pip list | grep websockets

# Test network connectivity
curl -I https://api.openai.com
```

### Common Errors

1. **401 Unauthorized**
   - Check API key is correct
   - Ensure key has Realtime API access

2. **Connection Refused**
   - Check firewall settings
   - Verify WebSocket support

3. **No Audio Output**
   - Audio responses save to .wav files
   - Check current directory for response_*.wav

### Cost Monitoring
⚠️ **Important**: The Realtime API has higher costs than standard APIs
- Text: $5/1M input tokens, $20/1M output tokens
- Audio: $100/1M input tokens (~$0.06/min), $200/1M output tokens (~$0.24/min)
- Monitor usage in OpenAI dashboard

## Quick Test Commands

```bash
# Test everything is working
python -c "import websockets; print('WebSockets OK')"
python -c "import os; print('API Key:', 'Set' if os.getenv('OPENAI_API_KEY') else 'Missing')"

# Run minimal test
python src/test_realtime_simple.py

# Check logs
tail -f logs/app.log  # If logging is enabled
```

## Support Resources

- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Console](https://github.com/openai/openai-realtime-console)
- [Research Documentation](docs/OPENAI_REALTIME_API_RESEARCH.md)
- [Project Architecture](CLAUDE.md)

## Team Collaboration

1. **For Developers**: Start with `test_realtime_simple.py` to understand the API
2. **For DevOps**: Review `.env.example` for configuration options
3. **For QA**: Test scripts are in `src/test_*.py`
4. **For PM**: Cost estimates in Research Documentation

---

**Ready to start?** Run `python src/test_realtime_simple.py` to verify everything is working!