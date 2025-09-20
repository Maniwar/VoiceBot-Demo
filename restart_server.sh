#!/bin/bash

echo "🔄 Restarting VoiceBot server..."

# Kill any existing server process
pkill -f "python src/server.py" 2>/dev/null

echo "⏳ Waiting for port to be released..."
sleep 2

# Start the server
echo "🚀 Starting server with all improvements..."
python src/server.py &

echo "✅ Server restarted!"
echo ""
echo "Test the improvements:"
echo "1. Regular mode: http://localhost:3000"
echo "2. RTC mode: http://localhost:3000/rtc.html"
echo "3. Admin panel: http://localhost:3000/admin.html"
echo ""
echo "📋 Key fixes applied:"
echo "- RTC mode has RAG and API calling support"
echo "- Speech no longer talks over itself"
echo "- Function calls are properly forwarded to clients"
echo "- Duplicate message handlers removed"