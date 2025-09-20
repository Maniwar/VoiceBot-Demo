#!/bin/bash

# Free Deployment Script - Deploy VoiceBot for FREE
# Supports multiple free platforms

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 VoiceBot Free Deployment Script${NC}"
echo "===================================="
echo ""

# Function to check command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to deploy to Render
deploy_render() {
    echo -e "${GREEN}Deploying to Render.com (Recommended)${NC}"
    echo "======================================="
    echo ""
    
    echo "Prerequisites:"
    echo "1. Create account at https://render.com"
    echo "2. Connect your GitHub account"
    echo ""
    
    # Check if render.yaml exists
    if [ ! -f render.yaml ]; then
        echo "Creating render.yaml..."
        cat > render.yaml <<EOF
services:
  - type: web
    name: voicebot-demo
    runtime: python
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: python src/server.py
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: PORT
        value: 3000
      - key: PYTHON_VERSION
        value: 3.11.0
      - key: OPENAI_API_KEY
        sync: false
EOF
    fi
    
    echo -e "${YELLOW}Steps to deploy on Render:${NC}"
    echo "1. Push your code to GitHub:"
    echo "   git add ."
    echo "   git commit -m 'Add Render configuration'"
    echo "   git push origin main"
    echo ""
    echo "2. Go to https://dashboard.render.com"
    echo "3. Click 'New +' → 'Web Service'"
    echo "4. Connect your GitHub repository"
    echo "5. Render will auto-detect the configuration"
    echo "6. Add your OPENAI_API_KEY in environment variables"
    echo "7. Click 'Create Web Service'"
    echo ""
    echo -e "${GREEN}Your app will be available at:${NC}"
    echo "https://voicebot-demo.onrender.com"
    echo ""
    echo "Note: Free tier spins down after 15 min of inactivity"
}

# Function to deploy to Railway
deploy_railway() {
    echo -e "${GREEN}Deploying to Railway.app${NC}"
    echo "========================"
    echo ""
    
    # Install Railway CLI if not exists
    if ! command_exists railway; then
        echo "Installing Railway CLI..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install railway
        else
            npm install -g @railway/cli
        fi
    fi
    
    echo "Logging in to Railway..."
    railway login
    
    echo "Initializing Railway project..."
    railway init
    
    echo "Setting environment variables..."
    echo "Enter your OpenAI API key:"
    read -s OPENAI_KEY
    railway variables set OPENAI_API_KEY=$OPENAI_KEY
    railway variables set PORT=3000
    
    echo "Deploying to Railway..."
    railway up
    
    echo ""
    echo -e "${GREEN}Deployment complete!${NC}"
    echo "Your app URL will be shown in the Railway dashboard"
    echo "Note: Free tier gives $5 credit (~20 days of usage)"
}

# Function to deploy to Google Cloud Run
deploy_gcloud() {
    echo -e "${GREEN}Deploying to Google Cloud Run${NC}"
    echo "=============================="
    echo ""
    
    # Check if gcloud is installed
    if ! command_exists gcloud; then
        echo "Installing Google Cloud SDK..."
        curl https://sdk.cloud.google.com | bash
        exec -l $SHELL
    fi
    
    echo "Authenticating with Google Cloud..."
    gcloud auth login
    
    echo "Setting up project..."
    PROJECT_ID=$(gcloud config get-value project)
    if [ -z "$PROJECT_ID" ]; then
        echo "Enter your Google Cloud project ID:"
        read PROJECT_ID
        gcloud config set project $PROJECT_ID
    fi
    
    echo "Enabling required APIs..."
    gcloud services enable run.googleapis.com
    gcloud services enable cloudbuild.googleapis.com
    
    echo "Enter your OpenAI API key:"
    read -s OPENAI_KEY
    
    echo "Deploying to Cloud Run..."
    gcloud run deploy voicebot-demo \
        --source . \
        --platform managed \
        --region us-central1 \
        --allow-unauthenticated \
        --set-env-vars OPENAI_API_KEY=$OPENAI_KEY,PORT=3000 \
        --memory 2Gi \
        --timeout 60 \
        --max-instances 1
    
    echo ""
    echo -e "${GREEN}Deployment complete!${NC}"
    echo "Your app URL will be displayed above"
}

# Function to deploy to Fly.io
deploy_fly() {
    echo -e "${GREEN}Deploying to Fly.io${NC}"
    echo "==================="
    echo ""
    
    # Install flyctl if not exists
    if ! command_exists flyctl; then
        echo "Installing Fly.io CLI..."
        curl -L https://fly.io/install.sh | sh
        export FLYCTL_INSTALL="/home/$USER/.fly"
        export PATH="$FLYCTL_INSTALL/bin:$PATH"
    fi
    
    echo "Authenticating with Fly.io..."
    flyctl auth login
    
    echo "Launching app..."
    flyctl launch --name voicebot-demo --region sjc
    
    echo "Enter your OpenAI API key:"
    read -s OPENAI_KEY
    flyctl secrets set OPENAI_API_KEY=$OPENAI_KEY
    
    echo "Deploying..."
    flyctl deploy
    
    echo ""
    echo -e "${GREEN}Deployment complete!${NC}"
    flyctl status
}

# Function to deploy to Replit
deploy_replit() {
    echo -e "${GREEN}Deploying to Replit${NC}"
    echo "==================="
    echo ""
    
    echo "Steps to deploy on Replit:"
    echo "1. Go to https://replit.com"
    echo "2. Click 'Create Repl'"
    echo "3. Import from GitHub"
    echo "4. Enter your repository URL"
    echo "5. In the Secrets tab, add:"
    echo "   - OPENAI_API_KEY = your_key"
    echo "6. Click 'Run'"
    echo ""
    echo "Your app will be available at:"
    echo "https://voicebot-demo.[your-username].repl.co"
}

# Function to set up free monitoring
setup_monitoring() {
    echo -e "${GREEN}Setting Up Free Monitoring${NC}"
    echo "=========================="
    echo ""
    
    echo "1. UptimeRobot (Prevent sleep):"
    echo "   - Sign up at https://uptimerobot.com"
    echo "   - Add monitor for: https://your-app-url/health"
    echo "   - Set interval to 5 minutes"
    echo ""
    echo "2. Sentry (Error tracking):"
    echo "   - Sign up at https://sentry.io"
    echo "   - Get free tier (5K errors/month)"
    echo "   - Add DSN to your environment"
    echo ""
    echo "3. LogDNA/Papertrail (Logs):"
    echo "   - Free tier available"
    echo "   - Easy integration"
}

# Main menu
echo "Choose deployment platform:"
echo ""
echo "🥇 1) Render.com       - Best free option, WebSocket support"
echo "🥈 2) Railway.app      - $5 credit, great performance"  
echo "🥉 3) Google Cloud Run - Generous free tier, complex setup"
echo "   4) Fly.io          - Good for global apps"
echo "   5) Replit          - Easiest, zero config"
echo "   6) Setup monitoring - Prevent app sleep"
echo ""
read -p "Enter choice (1-6): " choice

case $choice in
    1) deploy_render ;;
    2) deploy_railway ;;
    3) deploy_gcloud ;;
    4) deploy_fly ;;
    5) deploy_replit ;;
    6) setup_monitoring ;;
    *) echo "Invalid choice" ;;
esac

echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}Need help? Check FREE_HOSTING_GUIDE.md${NC}"
echo -e "${GREEN}===============================================${NC}"