# VoiceBot Demo - SDK Quick Reference
Our App
We’re building a production-ready voice assistant powered by the OpenAI Realtime SDK. The assistant supports rich speech-to-speech conversations, augments answers with Retrieval-Augmented Generation (RAG) from your knowledge base, and calls external APIs or workflows as needed. Everything is managed through a secure admin console where you can:

Configure tool definitions, API integrations, and multi-step workflows
Manage secrets and authentication keys
Toggle guardrails, prompt variations, and session defaults
Monitor usage, review conversation logs, and debug issues in real time
The goal is a single platform where product teams can design, deploy, and operate nuanced agentic voice experiences without diving into low-level infrastructure each time.
## Core Setup
```javascript
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";

const agent = new RealtimeAgent({
    name: "Assistant",
    instructions: "You are a helpful assistant."
});

const session = new RealtimeSession(agent);
await session.connect({ apiKey: ephemeralKey });
```

## Server Endpoint (Ephemeral Keys)
POST `https://api.openai.com/v1/realtime/client_secrets`
```javascript
{
    session: {
        type: "realtime",
        model: "gpt-realtime",
        audio: { output: { voice: "alloy" } }
    }
}
```

## Key SDK Features
- **Tools**: `tool({ name, parameters, execute })`
- **Handoffs**: `handoffs: [otherAgent]`
- **History**: `session.updateHistory()`
- **Audio**: `session.mute()`, `session.interrupt()`
- **Transport**: WebRTC (browser), WebSocket (server)




## Important
- Test-driven development required
- Clean up test files
- No auto-commits without approval
