#!/bin/bash

# VoiceBot Server Management Script

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

case "$1" in
    start)
        echo -e "${GREEN}Starting VoiceBot server...${NC}"
        
        # Kill any existing process on port 3000
        lsof -ti :3000 | xargs kill -9 2>/dev/null
        sleep 1
        
        # Start the server
        python src/server.py > /tmp/voicebot_server.log 2>&1 &
        SERVER_PID=$!
        
        # Wait and check if it started
        sleep 2
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Server started successfully (PID: $SERVER_PID)${NC}"
            echo ""
            echo "Access the application at:"
            echo "  📱 Regular Mode: http://localhost:3000"
            echo "  ⚡ RTC Mode: http://localhost:3000/index_rtc.html"
            echo "  🔧 Admin Panel: http://localhost:3000/admin.html"
            echo ""
            echo "Logs: tail -f /tmp/voicebot_server.log"
        else
            echo -e "${RED}❌ Server failed to start${NC}"
            echo "Check logs: cat /tmp/voicebot_server.log"
            exit 1
        fi
        ;;
        
    stop)
        echo -e "${YELLOW}Stopping VoiceBot server...${NC}"
        lsof -ti :3000 | xargs kill -9 2>/dev/null
        pkill -f "python src/server.py" 2>/dev/null
        echo -e "${GREEN}✅ Server stopped${NC}"
        ;;
        
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
        
    status)
        if lsof -i :3000 | grep -q LISTEN; then
            PID=$(lsof -ti :3000)
            echo -e "${GREEN}✅ Server is running (PID: $PID)${NC}"
        else
            echo -e "${RED}❌ Server is not running${NC}"
        fi
        ;;
        
    logs)
        if [ -f /tmp/voicebot_server.log ]; then
            tail -f /tmp/voicebot_server.log
        else
            echo "No log file found. Start the server first."
        fi
        ;;
        
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start   - Start the VoiceBot server"
        echo "  stop    - Stop the VoiceBot server"
        echo "  restart - Restart the VoiceBot server"
        echo "  status  - Check if server is running"
        echo "  logs    - Show server logs (live)"
        exit 1
        ;;
esac