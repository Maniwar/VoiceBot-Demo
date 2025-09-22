# 🎙️ VoiceBot Demo - Real-time Voice Assistant with RAG

A production-ready real-time voice assistant powered by OpenAI's Realtime API, featuring document management with RAG capabilities, web search, weather, and flight search.

## ✨ Features

- 🎤 **Real-time Voice Interaction** - Natural conversations using OpenAI's Realtime API (WebRTC)
- 📚 **RAG System** - Upload and search through documents (PDF, TXT, MD, CSV, JSON, images)
- 🔍 **Web Search** - Google Custom Search integration
- ✈️ **Flight Search** - Amadeus API for flight information
- 🌤️ **Weather** - OpenWeather API integration
- 🔐 **Secure API Management** - Encrypted storage for API keys
- 🎛️ **Admin Panel** - Complete control over bot settings and features

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- OpenAI API key with Realtime API access

### Installation

```bash
# Clone the repository
git clone https://github.com/Maniwar/VoiceBot-Demo.git
cd VoiceBot-Demo

# Install dependencies
npm install

# Copy environment example
cp .env.example .env

# Edit .env and add your OpenAI API key
# OPENAI_API_KEY=your-api-key-here

# Start the server
npm start
```

### Access the Application

- **Voice Assistant**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin.html

## 📁 Project Structure

```
VoiceBot-Demo/
├── server.js                 # Express server with all endpoints
├── public/
│   ├── index.html           # Main voice interface
│   ├── admin.html           # Admin control panel
│   └── voice-agent.html     # Voice agent implementation
├── src/
│   ├── agents/              # Voice agent configurations
│   ├── services/            # Core services
│   │   ├── configManager.js # Settings and API key management
│   │   └── documentManager.js # Document storage and RAG
│   └── tools/               # API integrations
│       ├── simpleRagTool.js # Document search tools
│       ├── googleSearchTool.js # Web search
│       ├── weatherTool.js   # Weather information
│       └── flightSearchTool.js # Flight search
├── documents/               # Uploaded documents (auto-created)
├── uploads/                 # Temporary upload directory
└── config/                  # Configuration files
```

## 🎛️ Admin Panel Features

### Bot Settings
- Voice selection (10+ voices available)
- Model configuration (gpt-4o-realtime-preview)
- Personality and behavior customization
- Session management settings

### Document Management
- Drag-and-drop file upload
- Support for PDF, TXT, MD, CSV, JSON, PNG, JPG
- Semantic search with embeddings
- Document library management

### API Configuration
- OpenAI API settings
- Google Custom Search setup
- Amadeus flight search
- OpenWeather configuration
- Encrypted storage for all credentials

## 🔧 API Setup

### Google Search
1. Get API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create Custom Search Engine at [Programmable Search Engine](https://programmablesearchengine.google.com)
3. Add credentials in Admin Panel > API Configuration

### Amadeus Flight Search
1. Register at [Amadeus for Developers](https://developers.amadeus.com)
2. Get Client ID and Secret
3. Configure in Admin Panel (Sandbox mode available)

### OpenWeather
1. Sign up at [OpenWeather](https://openweathermap.org/api)
2. Get API key
3. Add to Admin Panel configuration

## 🎤 Voice Commands Examples

- "Search for [topic] in my documents"
- "What's the weather in New York?"
- "Find flights from JFK to LAX next Monday"
- "Search the web for latest AI news"
- "List all uploaded documents"

## 🔒 Security

- API keys are encrypted using AES-256-GCM
- Sensitive data stored in `.env` (not committed)
- Configuration files in `config/` directory (gitignored)
- Session-based ephemeral keys for WebRTC

## 📝 License

MIT

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

## 🆘 Support

For issues or questions, please open a GitHub issue.