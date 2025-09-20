# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Real-time voice bot prototype with OpenAI Realtime API integration, RAG (Retrieval-Augmented Generation) capabilities, and API orchestration for voice-over-IP interactions. Designed to be deployable in cloud-based call center environments.

## Architecture Guidelines

### Core Components
- **Voice Interface Layer**: WebRTC/WebSocket-based real-time audio streaming
- **OpenAI Realtime API Integration**: Direct integration with OpenAI's voice models
- **RAG Pipeline**: Vector database integration for knowledge retrieval
- **API Orchestration**: Service mesh for managing multiple API calls and workflows
- **Session Management**: Stateful conversation handling across voice sessions

### Technology Stack
- **Backend**: Python (FastAPI/Flask) or Node.js (Express) for WebSocket handling
- **Voice Processing**: OpenAI Realtime API, Web Audio API
- **RAG System**: LangChain/LlamaIndex with vector database (Pinecone/Weaviate/Qdrant)
- **API Gateway**: Kong/Express Gateway for orchestration
- **Testing**: Jest/Pytest, WebRTC testing framework
- **Deployment**: Docker, Kubernetes-ready architecture

## Development Commands

### Environment Setup
```bash
# Create virtual environment (Python)
python -m venv venv
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt  # Python
# or
npm install  # Node.js
```

### Running the Application
```bash
# Development server with hot reload
python run.py --dev  # Python
# or
npm run dev  # Node.js

# Production server
python run.py --prod
# or
npm start
```

### Testing
```bash
# Run all tests
pytest tests/ -v  # Python
# or
npm test  # Node.js

# Run specific test suite
pytest tests/test_voice_processing.py -v
# or
npm test -- voice.test.js

# Run integration tests
pytest tests/integration/ -v --cov
# or
npm run test:integration

# Test WebRTC connections
npm run test:webrtc
```

### Code Quality
```bash
# Linting
pylint src/  # Python
black src/ --check  # Python formatting
# or
npm run lint  # JavaScript/TypeScript

# Type checking
mypy src/  # Python
# or
npm run typecheck  # TypeScript
```

## Project Structure

```
VoiceBot-Demo/
├── src/
│   ├── voice/           # Voice processing and WebRTC handling
│   ├── rag/             # RAG pipeline and vector DB integration
│   ├── orchestration/   # API orchestration and workflow management
│   ├── models/          # Data models and schemas
│   └── utils/           # Shared utilities
├── tests/
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── e2e/             # End-to-end tests
├── config/              # Configuration files
├── docs/                # Documentation
└── deploy/              # Deployment configurations
```

## Critical Implementation Notes

### OpenAI Realtime API Integration
- Use WebSocket connections for bidirectional streaming
- Implement proper session management and token handling
- Handle audio chunk buffering and streaming protocols
- Implement reconnection logic with exponential backoff

### RAG Implementation
- Use async vector database operations for performance
- Implement caching layer for frequently accessed documents
- Use streaming responses for large document retrievals
- Maintain conversation context across RAG queries

### Voice Processing
- Sample rate: 24kHz (OpenAI Realtime API requirement)
- Audio format: PCM16 or Opus
- Implement Voice Activity Detection (VAD)
- Handle interruption and turn-taking logic

### API Orchestration
- Implement circuit breaker pattern for external APIs
- Use async/await for concurrent API calls
- Implement proper retry logic with backoff
- Log all API interactions for debugging

### Security Considerations
- Store API keys in environment variables or secure vault
- Implement rate limiting for voice sessions
- Use TLS for all WebSocket connections
- Sanitize and validate all user inputs
- Implement session timeout mechanisms

## Environment Variables
```bash
OPENAI_API_KEY=          # OpenAI API key
OPENAI_REALTIME_URL=     # OpenAI Realtime API endpoint
VECTOR_DB_URL=           # Vector database connection string
VECTOR_DB_API_KEY=       # Vector database API key
REDIS_URL=               # Redis for session management
LOG_LEVEL=               # Logging level (DEBUG, INFO, WARNING, ERROR)
MAX_SESSION_DURATION=    # Maximum voice session duration in seconds
```

## Testing Strategy

### Unit Tests
- Test individual voice processing functions
- Mock OpenAI API responses
- Test RAG retrieval logic
- Validate data transformations

### Integration Tests
- Test WebSocket connection handling
- Test full RAG pipeline with test documents
- Test API orchestration workflows
- Validate session management

### Performance Tests
- Measure audio latency (target: <200ms)
- Test concurrent session handling
- Monitor memory usage during long sessions
- Validate streaming performance

## Debugging Tips

### Voice Issues
- Check browser console for WebRTC errors
- Verify audio permissions are granted
- Monitor WebSocket connection status
- Check audio format and sample rate

### RAG Issues
- Verify vector database connectivity
- Check embedding model compatibility
- Monitor retrieval latency
- Validate document chunking strategy

### API Issues
- Check rate limits on all external APIs
- Monitor API response times
- Verify API key validity
- Check network connectivity

## Performance Optimization

### Voice Optimization
- Use audio compression (Opus codec)
- Implement client-side audio buffering
- Use Web Workers for audio processing
- Minimize network round trips

### RAG Optimization
- Pre-compute and cache embeddings
- Use approximate nearest neighbor search
- Implement result ranking and filtering
- Batch vector operations

### System Optimization
- Use connection pooling for databases
- Implement response caching where appropriate
- Use CDN for static assets
- Monitor and optimize memory usage

## Deployment Checklist

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Rate limiting configured
- [ ] Monitoring and alerting setup
- [ ] Backup and recovery procedures
- [ ] Load testing completed
- [ ] Security audit performed
- [ ] Documentation updated
- [ ] Health check endpoints verified
- [ ] Graceful shutdown implemented