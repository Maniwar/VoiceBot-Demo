# OpenAI Realtime API Research Documentation
*Last Updated: September 2025*

## Executive Summary
The OpenAI Realtime API enables low-latency, multimodal conversational experiences through WebSocket connections. Released in October 2024, it supports natural speech-to-speech conversations using the GPT-4o model family.

## Key Technical Specifications

### API Endpoint
```
wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17
```

### Authentication
- **Method**: Bearer token in WebSocket headers
- **Header Format**: `Authorization: Bearer YOUR_API_KEY`
- **Note**: Browser WebSocket API doesn't support custom headers; use server-side proxy or Node.js

### Audio Requirements
- **Format**: PCM16 (16-bit linear PCM)
- **Sample Rate**: 24kHz
- **Channels**: Mono
- **Alternative**: Opus codec for compression

### Models Available
- `gpt-4o-realtime-preview-2024-12-17` (latest)
- `gpt-4o-realtime-preview-2024-10-01`
- `gpt-4o-mini-realtime-preview`

## Architecture Overview

### Event-Based Communication
The API uses a bidirectional event system:
- **Client Events**: 9 types (session.update, input_audio_buffer.append, etc.)
- **Server Events**: 28 types (session.created, response.audio.delta, etc.)

### Key Event Types

#### Client → Server
```javascript
{
  "type": "session.update",
  "session": {
    "modalities": ["text", "audio"],
    "instructions": "You are a helpful assistant.",
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
    }
  }
}
```

#### Server → Client
```javascript
{
  "type": "response.audio.delta",
  "response_id": "resp_123",
  "item_id": "item_456",
  "output_index": 0,
  "content_index": 0,
  "delta": "base64_encoded_audio_chunk"
}
```

## Performance Characteristics

### Latency Metrics
- **Time to First Byte**: ~500ms (US-based clients)
- **End-to-End Latency**: <700ms typical
- **Interruption Handling**: Automatic with VAD

### Rate Limits
- **Tier 5**: ~100 concurrent sessions
- **Audio Duration**: Unlimited during beta
- **Session Timeout**: Configurable

## Pricing (as of December 2024)

### Text
- **Input**: $5.00 / 1M tokens
- **Output**: $20.00 / 1M tokens
- **Cached Input**: $2.50 / 1M tokens

### Audio
- **Input**: $100.00 / 1M tokens (~$0.06/minute)
- **Output**: $200.00 / 1M tokens (~$0.24/minute)
- **Cached Audio Input**: $20.00 / 1M tokens

## Implementation Patterns

### 1. Basic Connection Setup (Python)
```python
import asyncio
import websockets
import json
import base64
import os

async def connect_realtime():
    url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
    headers = {
        "Authorization": f"Bearer {os.environ.get('OPENAI_API_KEY')}",
        "OpenAI-Beta": "realtime=v1"
    }
    
    async with websockets.connect(url, extra_headers=headers) as ws:
        # Configure session
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "voice": "alloy"
            }
        }))
        
        # Handle events
        async for message in ws:
            event = json.loads(message)
            print(f"Received: {event['type']}")
```

### 2. Basic Connection Setup (Node.js)
```javascript
const WebSocket = require('ws');

const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
    headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
    }
});

ws.on('open', () => {
    // Configure session
    ws.send(JSON.stringify({
        type: 'session.update',
        session: {
            modalities: ['text', 'audio'],
            voice: 'alloy'
        }
    }));
});

ws.on('message', (data) => {
    const event = JSON.parse(data);
    console.log('Received:', event.type);
});
```

## Voice Activity Detection (VAD)

### Server-side VAD Configuration
```json
{
  "turn_detection": {
    "type": "server_vad",
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 500
  }
}
```

### Client-side VAD
- Implement custom VAD for more control
- Use Web Audio API for browser-based detection
- Libraries: webrtcvad, silero-vad

## Function Calling Support

The API supports function calling during conversations:

```json
{
  "type": "session.update",
  "session": {
    "tools": [
      {
        "type": "function",
        "name": "get_weather",
        "description": "Get weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          }
        }
      }
    ]
  }
}
```

## Critical Implementation Considerations

### 1. Audio Streaming
- Buffer audio chunks before sending (recommended: 20ms chunks)
- Handle base64 encoding/decoding properly
- Implement audio queue for smooth playback

### 2. Error Handling
- Implement exponential backoff for reconnection
- Handle WebSocket disconnections gracefully
- Monitor rate limit headers

### 3. Session Management
- Store conversation context
- Implement session timeout handling
- Clean up resources on disconnect

### 4. Security
- Never expose API keys in client-side code
- Use server-side proxy for browser implementations
- Implement proper CORS handling

## Known Limitations

1. **Browser Restrictions**: Cannot set custom headers in browser WebSocket API
2. **Audio Format**: Limited to PCM16 and Opus
3. **Concurrent Sessions**: Limited based on tier
4. **Function Calling**: Response time increases with complex functions
5. **Cost**: Significantly higher than text-only APIs

## Official Resources

### GitHub Repositories
- **Official Node.js SDK**: https://github.com/openai/openai-node
- **Realtime Console**: https://github.com/openai/openai-realtime-console
- **Beta Reference Client**: https://github.com/openai/openai-realtime-api-beta

### Community Resources
- **Python Implementation**: https://github.com/p-i-/openai-realtime-py
- **Twilio Integration (Node)**: https://github.com/twilio-samples/speech-assistant-openai-realtime-api-node
- **Twilio Integration (Python)**: https://github.com/twilio-samples/speech-assistant-openai-realtime-api-python
- **Azure Integration**: https://github.com/Azure-Samples/aoai-realtime-audio-sdk

## Recommended Development Approach

### Phase 1: Basic Testing
1. Set up WebSocket connection
2. Test text-only communication
3. Verify authentication and session creation

### Phase 2: Audio Integration
1. Implement audio capture (getUserMedia)
2. Add audio streaming
3. Handle audio playback

### Phase 3: Production Features
1. Add VAD and interruption handling
2. Implement function calling
3. Add error recovery and monitoring

### Phase 4: RAG Integration
1. Connect vector database
2. Implement context retrieval
3. Add function calling for RAG queries

## Testing Checklist

- [ ] WebSocket connection establishes successfully
- [ ] Authentication works with API key
- [ ] Session configuration accepted
- [ ] Text messages send/receive properly
- [ ] Audio streams without interruption
- [ ] VAD triggers appropriately
- [ ] Interruptions handled smoothly
- [ ] Function calls execute correctly
- [ ] Error recovery works
- [ ] Session cleanup occurs on disconnect

## Cost Optimization Strategies

1. **Use Cached Inputs**: 50-80% cost reduction for repeated content
2. **Implement Client-side VAD**: Reduce unnecessary audio transmission
3. **Compress Audio**: Use Opus codec when possible
4. **Batch Operations**: Minimize session creation overhead
5. **Monitor Usage**: Implement usage tracking and alerts

## Next Steps for Implementation

1. Create `.env` file with `OPENAI_API_KEY`
2. Choose implementation language (Python/Node.js)
3. Set up basic WebSocket client
4. Test connection and authentication
5. Add audio streaming capabilities
6. Integrate RAG pipeline
7. Deploy behind secure proxy