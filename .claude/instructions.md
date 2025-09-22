OpenAI Realtime API – Local Reference Summary

Core Idea
The Realtime API lets you build low-latency, multimodal LLM apps that can take audio, image, and text inputs and return audio/text outputs—ideal for speech-to-speech “voice agents” or real-time transcription.

Recommended Tooling: Agents SDK (TypeScript)
Provides high-level helpers (RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC/OpenAIRealtimeWebSocket).
Handles WebRTC in browsers (auto mic/audio wiring) and WebSocket on servers.
Server supplies ephemeral client secrets (via openai.realtime.clientSecrets.create or POST /v1/realtime/client_secrets).
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";

const agent = new RealtimeAgent({
  name: "Assistant",
  instructions: "You are a helpful assistant.",
});

const session = new RealtimeSession(agent);
await session.connect({ apiKey: "<client-ephemeral-key>" });
Connection Methods
WebRTC – Browser/mobile clients, lowest latency audio handling (recommended).
WebSocket – Server-to-server, manual audio streaming.
SIP – Telephony integrations via VoIP providers (Twilio, etc.).
API Usage Guides
Prompting & session updates
Managing conversations/events
Server-side controls & tool calling
Realtime transcription
Beta → GA Migration Highlights
Remove OpenAI-Beta: realtime=v1 unless you need beta behavior.
Single endpoint for client secrets: POST /v1/realtime/client_secrets.
WebRTC SDP exchange uses /v1/realtime/calls.
session.update now requires session.type ("realtime" or "transcription").
Renamed events:
response.text.delta → response.output_text.delta
response.audio.delta → response.output_audio.delta
response.audio_transcript.delta → response.output_audio_transcript.delta
New conversation events: conversation.item.added / conversation.item.done.
All items carry object: 'realtime.item'; assistant outputs use output_text/output_audio.
Server Helpers
Manual fetch

const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    session: { type: "realtime", model: "gpt-realtime", audio: { output: { voice: "marin" } } },
  }),
});
const { value: ephemeralKey } = await response.json();
Node SDK (commit 3f007d6)

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const secret = await openai.realtime.clientSecrets.create({
  session: { type: "realtime", model: "gpt-realtime" },
});
res.json(secret); // secret.value is the ephemeral key
WebRTC Flow Summary
Browser sends SDP offer → server → POST /v1/realtime/calls → get answer.
Use RTCPeerConnection, attach mic track, create audio tag for remote audio.
Data channel ("oai-events") carries JSON events (client & server).
Ephemeral token flow

Browser requests token from your server.
Server calls /v1/realtime/client_secrets.
Browser uses the ephemeral key to post SDP directly to /v1/realtime/calls.
WebSocket Flow Summary
Connect to wss://api.openai.com/v1/realtime?model=gpt-realtime with standard API key (server-side).
Send/receive JSON events (session.update, conversation.item.create, response.create, etc.).
Stream audio by base64-encoding PCM chunks (input_audio_buffer.append + commit).
SIP Integration
Configure webhook in platform settings.
SIP provider routes calls to sip:<project_id>@sip.api.openai.com.
Webhook receives realtime.call.incoming; respond with accept/reject.
Monitor via wss://api.openai.com/v1/realtime?call_id=....
Key Session Events & Best Practices
session.created, session.updated, conversation.item.*, response.*, input_audio_buffer.*, error, mcp_*, tool_approval_requested, guardrail_tripped, etc.
VAD options: semantic_vad (default), server_vad. Tune create_response, interrupt_response.
Voice list: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, ember.
Turn detection and audio formats configurable at session or response level.
Model/voice cannot change after first audio response.
Advanced Features
Tool execution (tool helper with Zod params, needsApproval support).
Handoffs between agents (handoffs array).
Output guardrails (defineRealtimeOutputGuardrail) to interrupt unsafe content.
Custom transport layers (e.g., Twilio Media Streams wrapper).
Diagnostics & Debugging
Enable DEBUG=openai-agents*.
Monitor raw events: session.transport.on('*', handler).
Track usage via session.usage.
Handle reconnection, cache history, and implement fallback responses.
Example Projects (GitHub)
browser-minimal-realtime, node-websocket-cli, voice-agent-nextjs, voice-agent-twilio, voice-agent-gpt-realtime-template, voice-agent-sveltekit, voice-agent-electron, voice-agent-serverless, voice-agent-python-websocket.
openai-realtime-agents repo packages a full production-style voice agent.
Additional Resources
Realtime docs
Agents SDK docs
Realtime API reference
Cookbook notebook (script view): https://nbviewer.org/format/script/github/openai/openai-cookbook/blob/main/examples/agents_sdk/app_assistant_voice_agents.ipynb
This local reference covers everything needed to work offline: API endpoints, event shapes, VAD/audio settings, SDK class behavior, migration notes, example flows, tooling tips, and troubleshooting.