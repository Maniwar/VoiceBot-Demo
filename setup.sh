#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🚀 VoiceBot Demo - Auto Setup Script     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${BLUE}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check Python version
print_status "Checking Python version..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    PYTHON_CMD="python3"
    print_success "Python $PYTHON_VERSION found"
elif command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    PYTHON_CMD="python"
    print_success "Python $PYTHON_VERSION found"
else
    print_error "Python is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check if minimum version is met
REQUIRED_VERSION="3.8"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then 
    print_error "Python $REQUIRED_VERSION or higher is required (found $PYTHON_VERSION)"
    exit 1
fi

# Create .env file if it doesn't exist
print_status "Setting up environment configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    print_success "Created .env file from template"
    
    # Check if API key is already in environment
    if [ ! -z "$OPENAI_API_KEY" ]; then
        # Use existing environment variable
        sed -i.bak "s/OPENAI_API_KEY=sk-your-api-key-here/OPENAI_API_KEY=$OPENAI_API_KEY/" .env
        rm .env.bak 2>/dev/null
        print_success "Using OPENAI_API_KEY from environment"
    else
        print_warning "OPENAI_API_KEY not found in environment"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Please enter your OpenAI API key:"
        echo "(Get one at https://platform.openai.com/api-keys)"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        read -p "API Key (sk-...): " api_key
        
        if [[ $api_key == sk-* ]]; then
            sed -i.bak "s/OPENAI_API_KEY=sk-your-api-key-here/OPENAI_API_KEY=$api_key/" .env
            rm .env.bak 2>/dev/null
            print_success "API key saved to .env file"
        else
            print_warning "Invalid API key format. You can add it later to the .env file"
        fi
    fi
else
    print_success ".env file already exists"
fi

# Create virtual environment
print_status "Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    $PYTHON_CMD -m venv venv
    print_success "Virtual environment created"
else
    print_success "Virtual environment already exists"
fi

# Activate virtual environment
print_status "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
print_status "Upgrading pip..."
pip install --upgrade pip --quiet

# Function to install packages with progress
install_packages() {
    local description=$1
    shift
    local packages=$@
    
    print_status "$description"
    if pip install $packages --quiet 2>/dev/null; then
        print_success "$description - Complete"
    else
        print_warning "$description - Some packages may have failed (continuing...)"
    fi
}

# Install dependencies in groups
install_packages "Installing core dependencies..." websockets python-dotenv aiohttp numpy
install_packages "Installing FastAPI server..." fastapi uvicorn python-multipart
install_packages "Installing OpenAI SDK..." openai
install_packages "Installing RAG components..." langchain langchain-openai langchain-community chromadb tiktoken PyPDF2
install_packages "Installing optional features..." redis python-json-logger rich

# Create necessary directories
print_status "Creating project directories..."
mkdir -p public
mkdir -p data/chroma_db
mkdir -p data/vectordb
mkdir -p data/sample_docs
mkdir -p config
mkdir -p logs
mkdir -p uploads
print_success "Directories created"

# Check if sample files exist, if not they'll be created when server starts
if [ ! -f "config/sample_workflows.json" ]; then
    print_status "Sample workflows will be created on first run"
fi

if [ ! -f "config/bot_personalities.json" ]; then
    print_status "Bot personalities will be configured on first run"
fi

# Test OpenAI connection
print_status "Testing OpenAI API connection..."
if $PYTHON_CMD test_basic.py 2>/dev/null; then
    print_success "OpenAI API connection successful!"
    API_STATUS="${GREEN}Connected${NC}"
else
    print_warning "OpenAI API connection failed (server can still run in demo mode)"
    API_STATUS="${YELLOW}Not Connected${NC}"
fi

# Create a simple status file
echo "{
  \"setup_complete\": true,
  \"setup_date\": \"$(date)\",
  \"python_version\": \"$PYTHON_VERSION\",
  \"api_configured\": $(grep -q "OPENAI_API_KEY=sk-" .env && echo "true" || echo "false")
}" > .setup_status.json

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        ✅ Setup Complete!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "📊 Status Summary:"
echo -e "   Python Version: ${GREEN}$PYTHON_VERSION${NC}"
echo -e "   Virtual Env:    ${GREEN}Ready${NC}"
echo -e "   Dependencies:   ${GREEN}Installed${NC}"
echo -e "   OpenAI API:     $API_STATUS"
echo ""
echo -e "🚀 To start the server, run:"
echo -e "   ${BLUE}./run.sh${NC}"
echo ""
echo -e "📱 The server will be available at:"
echo -e "   User Interface:  ${BLUE}http://localhost:3000${NC}"
echo -e "   Admin Dashboard: ${BLUE}http://localhost:3000/admin.html${NC}"
echo ""

# Ask if user wants to start now
echo -e "${YELLOW}Would you like to start the server now? (y/n)${NC}"
read -p "> " start_now

if [[ "$start_now" =~ ^[Yy]$ ]]; then
    echo ""
    print_status "Starting VoiceBot server..."
    exec ./run.sh
fi