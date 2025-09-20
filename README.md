# 🎙️ VoiceBot Demo - Real-time Voice Assistant

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/YOUR_USERNAME/VoiceBot-Demo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)

A production-ready real-time voice assistant powered by OpenAI's Realtime API, featuring RAG capabilities, flight search, and seamless API orchestration.

## ✨ Features

- 🎙️ **Real-time Voice Interaction** - Natural conversations using OpenAI's Realtime API
- 📚 **RAG (Retrieval-Augmented Generation)** - Upload and query your own documents
- ✈️ **Flight Search** - Integrated Amadeus API for real-time flight information
- 🔌 **API Orchestration** - Connect to 40+ external APIs
- 🌐 **WebSocket Support** - Low-latency bidirectional communication
- 📱 **Responsive Web Interface** - Works on desktop and mobile
- 🚀 **Production Ready** - Docker support, health checks, logging

## 🖼️ Demo

Try the live demo: [Coming Soon]

![VoiceBot Demo](docs/images/demo.gif)

## 🚀 Quick Start

### Option 1: Deploy to Render (FREE - Recommended)

1. Click the "Deploy to Render" button above
2. Add your `OPENAI_API_KEY` in environment variables
3. Your app will be live in ~5 minutes!

### Option 2: Run Locally

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/VoiceBot-Demo.git
cd VoiceBot-Demo

# Copy environment variables
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Install dependencies
pip install -r requirements.txt

# Run the server
python src/server.py

# Open browser to http://localhost:3000
```

### Option 3: Docker

```bash
# Build and run with Docker Compose
docker-compose up

# Or build manually
docker build -t voicebot .
docker run -p 3000:3000 --env-file .env voicebot
```

## 📋 Prerequisites

- Python 3.11+
- OpenAI API key with Realtime API access
- (Optional) Amadeus API credentials for flight search
- (Optional) Docker for containerization

## 🔧 Configuration

### Environment Variables

Create a `.env` file with:

```bash
# Required
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-realtime-preview-2024-12-17

# Optional
PORT=3000
LOG_LEVEL=info

# For flight search (optional)
# Configure in data/api_config.json
```

### API Configuration

Edit `data/api_config.json` to add your API keys for external services:
- Amadeus (flight search)
- Google Custom Search
- Other APIs

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│            Web Browser Client                │
│         (HTML/JavaScript/WebRTC)             │
└─────────────────────────────────────────────┘
                      ↕ WebSocket
┌─────────────────────────────────────────────┐
│             FastAPI Server                   │
│         (WebSocket Handler + API)            │
├─────────────────────────────────────────────┤
│   • OpenAI Realtime API Integration          │
│   • RAG Pipeline (ChromaDB)                  │
│   • Flight Search (Amadeus)                  │
│   • API Orchestration                        │
└─────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────┐
│           External Services                  │
│   OpenAI │ Amadeus │ Google │ Others        │
└─────────────────────────────────────────────┘
```

## 🎯 Usage Examples

### Voice Commands

- **General Chat**: "Hello, how are you today?"
- **RAG Query**: "What does the uploaded document say about pricing?"
- **Flight Search**: "Find flights from New York to London tomorrow"
- **Weather**: "What's the weather in San Francisco?"
- **Web Search**: "Search for the latest news about AI"

### Uploading Documents for RAG

1. Click "Upload Document" in the admin panel
2. Select PDF, TXT, or MD files
3. Documents are automatically processed and indexed
4. Query with: "What does the document say about..."

## 💻 Development

### Project Structure

```
VoiceBot-Demo/
├── src/                    # Source code
│   ├── server.py          # Main FastAPI server
│   ├── flight_handler.py  # Flight search logic
│   └── ...
├── public/                 # Frontend files
│   ├── index.html         # Main interface
│   ├── app.js            # Client-side logic
│   └── ...
├── data/                   # Configuration
│   └── api_config.json    # API settings
├── requirements.txt        # Python dependencies
├── Dockerfile             # Container config
├── docker-compose.yml     # Docker orchestration
└── render.yaml            # Render deployment
```

### Adding New Features

1. **New API Integration**: Edit `data/api_config.json`
2. **Custom Functions**: Add to `src/server.py` in `handle_function_call()`
3. **Frontend Changes**: Edit files in `public/`

### Running Tests

```bash
# Basic functionality test
python test_basic.py

# Flight API test
python test_voice_flight.py
```

## 🚀 Deployment

### Free Hosting Options

1. **Render.com** (Recommended)
   - WebSocket support
   - Auto-deploy from GitHub
   - 750 hours free/month

2. **Railway.app**
   - $5 credit
   - Better performance
   - No sleep

3. **Google Cloud Run**
   - 2M requests free/month
   - Auto-scaling

See [FREE_HOSTING_GUIDE.md](FREE_HOSTING_GUIDE.md) for detailed instructions.

### Production Deployment (AWS)

See [AWS_DEPLOYMENT_GUIDE.md](AWS_DEPLOYMENT_GUIDE.md) for:
- ECS Fargate setup
- Auto-scaling configuration
- CloudFront CDN
- Cost optimization

## 📚 Documentation

- [AWS Deployment Guide](AWS_DEPLOYMENT_GUIDE.md)
- [Free Hosting Guide](FREE_HOSTING_GUIDE.md)
- [Flight API Documentation](FLIGHT_API_IMPROVEMENTS.md)
- [Demo Guide](DEMO_GUIDE.md)
- [RAG Setup](HOW_TO_DEMO_RAG.md)

## 🔒 Security

- Never commit `.env` files
- Use environment variables for secrets
- Enable HTTPS in production
- Regular dependency updates
- Input validation on all endpoints

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for the Realtime API
- Amadeus for flight data
- The open-source community

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/VoiceBot-Demo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/VoiceBot-Demo/discussions)

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=YOUR_USERNAME/VoiceBot-Demo&type=Date)](https://star-history.com/#YOUR_USERNAME/VoiceBot-Demo&Date)

---

**Built with ❤️ using OpenAI's Realtime API**