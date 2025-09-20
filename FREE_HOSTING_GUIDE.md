# Free Hosting Guide for VoiceBot Demo

## Overview of Free Hosting Options

### ⚠️ Important Limitations
Most free hosting has restrictions that may affect the VoiceBot:
- WebSocket support (required for real-time audio)
- Memory/CPU limits (voice processing needs resources)
- Request timeouts (flight searches take 15-20 seconds)
- Storage limits (for RAG documents)

## Ranked Free Hosting Options

### 1. 🥇 **Render.com** (BEST FREE OPTION)
**Free Tier**: 750 hours/month, WebSocket support, 512MB RAM

```bash
# Create render.yaml
cat > render.yaml <<EOF
services:
  - type: web
    name: voicebot-demo
    env: python
    buildCommand: "pip install -r requirements.txt"
    startCommand: "python src/server.py"
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: PORT
        value: 3000
    autoDeploy: true
EOF

# Deploy via GitHub
# 1. Push to GitHub
# 2. Connect repo at https://render.com
# 3. Deploy automatically
```

**Pros:**
- ✅ WebSocket support
- ✅ Custom domains
- ✅ Automatic SSL
- ✅ Environment variables
- ✅ Automatic deploys from GitHub

**Cons:**
- ❌ Spins down after 15 min inactivity
- ❌ Limited to 512MB RAM
- ❌ May timeout on long operations

### 2. 🥈 **Railway.app** (EXCELLENT BUT LIMITED)
**Free Tier**: $5 credit/month, ~500 hours of usage

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up

# Add environment variables in dashboard
railway variables set OPENAI_API_KEY=your_key
```

**Pros:**
- ✅ Full WebSocket support
- ✅ 8GB RAM available
- ✅ Persistent storage
- ✅ No sleep/spin-down
- ✅ Excellent for demos

**Cons:**
- ❌ Only $5 free credit (runs out in ~20 days)
- ❌ Requires credit card after trial

### 3. 🥉 **Google Cloud Run** (GENEROUS FREE TIER)
**Free Tier**: 2 million requests/month, 360,000 GB-seconds

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash

# Initialize and authenticate
gcloud init
gcloud auth login

# Build and deploy
gcloud run deploy voicebot-demo \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=$OPENAI_API_KEY \
  --memory 2Gi \
  --timeout 60 \
  --max-instances 1
```

**Pros:**
- ✅ 2GB RAM available
- ✅ WebSocket support (with some config)
- ✅ Generous free tier
- ✅ Auto-scaling

**Cons:**
- ❌ Cold starts
- ❌ Max 60-second timeout
- ❌ Complex WebSocket setup

### 4. **Fly.io** (GOOD FOR GLOBAL DEPLOYMENT)
**Free Tier**: 3 shared VMs, 160GB transfer

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch app
flyctl launch

# Deploy
flyctl deploy

# Set secrets
flyctl secrets set OPENAI_API_KEY=your_key
```

Create `fly.toml`:
```toml
app = "voicebot-demo"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"

[experimental]
  allowed_public_ports = []
  auto_rollback = true

[[services]]
  http_checks = []
  internal_port = 3000
  protocol = "tcp"
  script_checks = []

  [services.concurrency]
    hard_limit = 25
    soft_limit = 20
    type = "connections"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.tcp_checks]]
    grace_period = "1s"
    interval = "15s"
    restart_limit = 0
    timeout = "2s"
```

**Pros:**
- ✅ WebSocket support
- ✅ Global edge deployment
- ✅ 256MB RAM (upgradeable)
- ✅ Persistent storage available

**Cons:**
- ❌ Limited free resources
- ❌ Requires credit card

### 5. **Replit** (EASIEST SETUP)
**Free Tier**: Always-on repls with limitations

```python
# Create .replit file
run = "python src/server.py"

[env]
OPENAI_API_KEY = "your_key_here"

[packager]
language = "python3"

[packager.features]
packageSearch = true
guessImports = true
```

**Steps:**
1. Import from GitHub at https://replit.com
2. Add secrets in Secrets tab
3. Click Run

**Pros:**
- ✅ Zero configuration
- ✅ WebSocket support
- ✅ Online IDE
- ✅ Instant deployment

**Cons:**
- ❌ Limited resources (256MB RAM)
- ❌ Sleeps after inactivity
- ❌ Public code (unless paid)

### 6. **Vercel** (LIMITED - BETTER FOR FRONTEND)
**Free Tier**: Unlimited deployments, 100GB bandwidth

**Note**: Vercel doesn't support WebSockets well. Better to split:
- Frontend on Vercel
- Backend API on Render/Railway

### 7. **Heroku** (NO LONGER FREE)
Heroku discontinued free tier in 2022.

## 🎯 Recommended Free Stack

### Option A: Full Feature Free Hosting
1. **Backend**: Render.com (WebSocket + API)
2. **Database**: Supabase (Free PostgreSQL)
3. **Vector DB**: Pinecone (Free tier)
4. **Frontend**: Vercel or Netlify

### Option B: Minimal Free Hosting
1. **All-in-one**: Railway.app ($5 credit)
2. **Backup**: Google Cloud Run

## 📝 Step-by-Step: Deploy to Render (Recommended)

### 1. Prepare Your Repository
```bash
# Create requirements.txt if not exists
pip freeze > requirements.txt

# Create render.yaml
cat > render.yaml <<EOF
services:
  - type: web
    name: voicebot-demo
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: python src/server.py
    healthCheckPath: /health
    envVars:
      - key: PORT
        value: 3000
      - key: PYTHON_VERSION
        value: 3.11.0
EOF

# Push to GitHub
git add .
git commit -m "Add Render configuration"
git push
```

### 2. Deploy on Render
1. Go to https://render.com
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect your GitHub repo
5. Configure:
   - Name: `voicebot-demo`
   - Region: Choose nearest
   - Branch: `main`
   - Runtime: Python 3
   - Build: `pip install -r requirements.txt`
   - Start: `python src/server.py`
6. Add environment variables:
   - `OPENAI_API_KEY`: Your key
   - `PORT`: 3000
7. Click "Create Web Service"

### 3. Access Your App
- URL: `https://voicebot-demo.onrender.com`
- WebSocket: `wss://voicebot-demo.onrender.com/ws`

## 🔧 Optimizations for Free Hosting

### 1. Reduce Memory Usage
```python
# In src/server.py, add memory optimization
import gc

# Periodically clean up
async def cleanup_task():
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        gc.collect()
```

### 2. Use External Services
```python
# Use free external services instead of local
VECTOR_DB = "Pinecone"  # Free 100K vectors
CACHE = "Upstash Redis"  # Free 10K commands/day
STORAGE = "Cloudinary"  # Free media storage
```

### 3. Implement Caching
```python
# Cache flight searches to reduce API calls
from functools import lru_cache

@lru_cache(maxsize=100)
def cached_flight_search(origin, dest, date):
    return search_flights(origin, dest, date)
```

### 4. Optimize Docker Image
```dockerfile
# Use slim Python image
FROM python:3.11-slim

# Multi-stage build
FROM python:3.11-slim as builder
# ... build steps ...

FROM python:3.11-slim
COPY --from=builder /app /app
```

## 💰 Cost Comparison

| Platform | Free Tier | Limitations | Best For |
|----------|-----------|-------------|----------|
| Render | 750 hrs/mo | Sleeps after 15 min | Demos, prototypes |
| Railway | $5 credit | Runs out in ~20 days | Short-term testing |
| Google Cloud Run | 2M requests | Cold starts | Production apps |
| Fly.io | 3 VMs | Limited resources | Global apps |
| Replit | Always-on | 256MB RAM | Quick prototypes |

## 🚨 Free Tier Limitations & Solutions

### Problem 1: Sleep/Spin-down
**Solution**: Use UptimeRobot to ping every 14 minutes
```bash
# Free monitoring at https://uptimerobot.com
# Add monitor for: https://your-app.onrender.com/health
```

### Problem 2: Timeout on Flight Searches
**Solution**: Implement background jobs
```python
# Return immediately, process in background
@app.post("/search-flights-async")
async def search_flights_async(params: dict):
    task_id = str(uuid.uuid4())
    background_tasks.add_task(process_flight_search, task_id, params)
    return {"task_id": task_id, "status": "processing"}
```

### Problem 3: Limited Storage
**Solution**: Use external free storage
- **Cloudinary**: Free 25GB for media
- **Firebase Storage**: Free 5GB
- **Supabase Storage**: Free 1GB

### Problem 4: Rate Limits
**Solution**: Implement request queuing
```python
from asyncio import Queue

request_queue = Queue(maxsize=100)

async def process_queue():
    while True:
        request = await request_queue.get()
        await handle_request(request)
        await asyncio.sleep(0.1)  # Rate limit
```

## 📊 Monitoring Your Free App

### Free Monitoring Services
1. **UptimeRobot**: Uptime monitoring
2. **Sentry**: Error tracking (free tier)
3. **LogDNA**: Log management (free tier)
4. **New Relic**: APM (free tier)

### Basic Health Check
```python
@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "free_memory": get_free_memory(),
        "active_connections": len(proxy.client_connections)
    }
```

## 🎓 Student/Startup Credits

### GitHub Student Pack
- **DigitalOcean**: $200 credit
- **Azure**: $100 credit
- **Heroku**: Was free (discontinued)

### Startup Programs
- **AWS Activate**: Up to $100k credits
- **Google Cloud**: Up to $100k credits
- **Azure Startups**: Up to $150k credits

## ✅ Quick Decision Guide

### Choose Render.com if:
- You need WebSocket support
- You want GitHub auto-deploy
- You're okay with cold starts

### Choose Railway if:
- You need better performance
- You have $5 to spare
- You need persistent storage

### Choose Google Cloud Run if:
- You have GCP experience
- You need scalability
- You can handle cold starts

### Choose Replit if:
- You want zero configuration
- You need online IDE
- You're just testing

## 🚀 Quickest Path to Free Hosting

```bash
# 1. Sign up at render.com
# 2. Connect GitHub
# 3. Deploy in 2 clicks

# That's it! Your app is live at:
# https://[your-app].onrender.com
```

## 📝 Final Recommendations

For the VoiceBot specifically, considering it needs:
- WebSocket support (for real-time audio)
- 20-second timeouts (for flight searches)
- Memory for audio processing

**Best free option**: **Render.com** with these optimizations:
1. Use external Pinecone for vector DB
2. Implement caching for flight searches
3. Use UptimeRobot to prevent sleep
4. Consider splitting frontend/backend if needed

**If you need better performance**: Use Railway.app for as long as the $5 credit lasts, then switch to Render.

Remember: Free hosting is great for demos and prototypes, but for production use with real users, consider paid hosting for better reliability and performance.