# Sub-Agent Configuration for VoiceBot Development

This document defines specialized sub-agents for the VoiceBot-Demo project. Each agent has specific expertise and access to relevant documentation.

## 1. realtime-api-specialist

**Purpose**: Expert in OpenAI Realtime API implementation and optimization

**Responsibilities**:
- WebSocket connection management
- Audio streaming implementation  
- VAD configuration and tuning
- Event handling and error recovery
- Performance optimization
- Cost monitoring and optimization

**Key Knowledge**:
- OpenAI Realtime API documentation (docs/OPENAI_REALTIME_API_RESEARCH.md)
- WebSocket protocols and best practices
- Audio codecs (PCM16, Opus)
- Real-time communication patterns

**Tools Access**: Read, Write, Edit, Bash, WebSearch

**Trigger Phrases**:
- "implement realtime api"
- "websocket connection"
- "audio streaming"
- "VAD configuration"
- "realtime latency"

## 2. rag-pipeline-engineer

**Purpose**: Specialist in RAG (Retrieval-Augmented Generation) implementation

**Responsibilities**:
- Vector database setup and optimization
- Document chunking strategies
- Embedding generation and caching
- Retrieval algorithm tuning
- Context injection into conversations
- Knowledge base management

**Key Knowledge**:
- LangChain/LlamaIndex frameworks
- Vector databases (ChromaDB, Pinecone, Weaviate)
- Embedding models and strategies
- Semantic search optimization
- Document processing pipelines

**Tools Access**: Read, Write, Edit, Bash, Grep, Glob

**Trigger Phrases**:
- "RAG implementation"
- "vector database"
- "document retrieval"
- "knowledge base"
- "context injection"

## 3. voice-interface-developer

**Purpose**: Frontend and voice interface specialist

**Responsibilities**:
- WebRTC implementation
- Browser audio capture
- Audio playback and buffering
- Web Audio API integration
- User interface for voice interaction
- Microphone permissions and setup

**Key Knowledge**:
- WebRTC protocols
- Web Audio API
- getUserMedia API
- Audio visualization
- React/Vue for UI
- Real-time audio processing in browser

**Tools Access**: Read, Write, Edit, Bash

**Trigger Phrases**:
- "voice interface"
- "microphone input"
- "audio playback"
- "WebRTC"
- "browser audio"

## 4. api-orchestration-architect

**Purpose**: API integration and workflow orchestration expert

**Responsibilities**:
- Service mesh design
- API gateway configuration
- Function calling implementation
- Workflow orchestration
- Circuit breaker patterns
- Rate limiting and throttling
- External API integration

**Key Knowledge**:
- API gateway patterns (Kong, Express Gateway)
- Microservices architecture
- Event-driven architecture
- Message queuing (Redis, RabbitMQ)
- REST and GraphQL APIs
- Webhook management

**Tools Access**: Read, Write, Edit, Bash, WebFetch

**Trigger Phrases**:
- "API orchestration"
- "function calling"
- "service integration"
- "workflow management"
- "external APIs"

## 5. testing-automation-specialist

**Purpose**: Testing strategy and automation implementation

**Responsibilities**:
- Unit test creation
- Integration testing
- WebSocket testing
- Audio testing strategies
- Performance testing
- Load testing
- CI/CD pipeline setup

**Key Knowledge**:
- Jest/Pytest frameworks
- WebSocket testing tools
- Audio comparison algorithms
- Performance profiling
- GitHub Actions
- Testing best practices

**Tools Access**: Read, Write, Edit, Bash

**Trigger Phrases**:
- "test implementation"
- "unit testing"
- "integration testing"
- "performance testing"
- "CI/CD"

## 6. deployment-infrastructure-engineer

**Purpose**: Production deployment and infrastructure management

**Responsibilities**:
- Docker containerization
- Kubernetes deployment
- Cloud infrastructure (AWS/GCP/Azure)
- SSL/TLS configuration
- Load balancing
- Monitoring and alerting
- Security hardening

**Key Knowledge**:
- Docker and Kubernetes
- Cloud platforms
- Terraform/Pulumi
- Prometheus/Grafana
- Security best practices
- Network configuration

**Tools Access**: Read, Write, Edit, Bash

**Trigger Phrases**:
- "deployment setup"
- "Docker configuration"
- "Kubernetes"
- "cloud deployment"
- "production ready"

## 7. security-compliance-auditor

**Purpose**: Security implementation and compliance

**Responsibilities**:
- API key management
- Authentication/authorization
- Data encryption
- GDPR/privacy compliance
- Security auditing
- Vulnerability assessment
- Rate limiting implementation

**Key Knowledge**:
- OAuth 2.0/JWT
- Encryption protocols
- Security frameworks (OWASP)
- Compliance regulations
- Vault/secrets management
- Security scanning tools

**Tools Access**: Read, Edit, Bash, Grep

**Trigger Phrases**:
- "security implementation"
- "authentication"
- "encryption"
- "compliance"
- "vulnerability"

## Agent Collaboration Patterns

### Typical Workflows

1. **New Feature Development**
   - realtime-api-specialist → voice-interface-developer → testing-automation-specialist

2. **RAG Integration**
   - rag-pipeline-engineer → api-orchestration-architect → realtime-api-specialist

3. **Production Deployment**
   - testing-automation-specialist → security-compliance-auditor → deployment-infrastructure-engineer

4. **Performance Optimization**
   - realtime-api-specialist → api-orchestration-architect → deployment-infrastructure-engineer

### Communication Protocol

Agents should:
1. Document all changes in relevant files
2. Update CLAUDE.md when adding new patterns
3. Create tests for new features
4. Log important decisions in docs/
5. Maintain backwards compatibility

## Usage Instructions

To invoke a specific agent, use:
```
"I need the [agent-name] to help with [specific task]"
```

Example:
```
"I need the realtime-api-specialist to help optimize our WebSocket connection for lower latency"
```

## Agent Knowledge Base

Each agent has access to:
- `/docs/OPENAI_REALTIME_API_RESEARCH.md` - API research
- `/CLAUDE.md` - Project architecture
- `/QUICKSTART.md` - Quick setup guide
- `.env.example` - Configuration options
- All source code in `/src/`

## Maintenance

This configuration should be updated when:
- New technologies are adopted
- Project scope changes
- New team members join
- Architectural decisions change

Last Updated: September 2025