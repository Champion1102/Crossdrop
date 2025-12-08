#!/bin/bash

# Crossdrop Development Startup Script
# Starts signaling server, frontend, and ngrok tunnels

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Crossdrop Development Environment   ${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if ngrok is authenticated
if ! ngrok config check &>/dev/null; then
    echo -e "${YELLOW}⚠️  ngrok is not configured${NC}"
    echo -e "Please run: ${GREEN}ngrok config add-authtoken YOUR_TOKEN${NC}"
    echo -e "Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo ""
    echo -e "${YELLOW}For now, starting in LOCAL mode (same network only)${NC}"
    LOCAL_MODE=true
else
    LOCAL_MODE=false
fi

# Get the local IP address
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
echo -e "${GREEN}Local IP:${NC} $LOCAL_IP"

# Kill any existing processes on our ports
echo -e "\n${YELLOW}Cleaning up existing processes...${NC}"
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Start signaling server
echo -e "\n${GREEN}Starting signaling server...${NC}"
cd backend/signaling-server
npm start &
SIGNAL_PID=$!
cd ../..

# Wait for signaling server to be ready
sleep 2

# Test signaling server
if curl -s http://localhost:3001/health > /dev/null; then
    echo -e "${GREEN}✓ Signaling server running on port 3001${NC}"
else
    echo -e "${RED}✗ Signaling server failed to start${NC}"
    exit 1
fi

if [ "$LOCAL_MODE" = true ]; then
    # Local mode - just use local IP
    echo -e "\n${YELLOW}Running in LOCAL mode${NC}"

    # Create .env.local for frontend
    echo "VITE_SIGNALING_URL=http://$LOCAL_IP:3001" > frontend/.env.local

    # Start frontend
    echo -e "\n${GREEN}Starting frontend...${NC}"
    cd frontend
    npm run dev -- --host &
    FRONTEND_PID=$!
    cd ..

    sleep 3

    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${GREEN}Development servers are running!${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e ""
    echo -e "📱 ${GREEN}Access from your phone:${NC}"
    echo -e "   http://$LOCAL_IP:5173"
    echo -e ""
    echo -e "💻 ${GREEN}Access from this Mac:${NC}"
    echo -e "   http://localhost:5173"
    echo -e ""
    echo -e "${YELLOW}Note: Both devices must be on the same WiFi${NC}"
    echo -e ""
    echo -e "Press Ctrl+C to stop all servers"

else
    # ngrok mode - create public URLs
    echo -e "\n${GREEN}Starting ngrok tunnels...${NC}"

    # Start ngrok for signaling server
    ngrok http 3001 --log=stdout > /tmp/ngrok-signal.log 2>&1 &
    NGROK_SIGNAL_PID=$!

    sleep 3

    # Get the signaling ngrok URL
    SIGNAL_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

    if [ -z "$SIGNAL_URL" ]; then
        echo -e "${RED}Failed to get ngrok URL. Falling back to local mode.${NC}"
        kill $NGROK_SIGNAL_PID 2>/dev/null || true
        SIGNAL_URL="http://$LOCAL_IP:3001"
    else
        echo -e "${GREEN}✓ Signaling server ngrok URL: $SIGNAL_URL${NC}"
    fi

    # Create .env.local for frontend
    echo "VITE_SIGNALING_URL=$SIGNAL_URL" > frontend/.env.local

    # Start frontend
    echo -e "\n${GREEN}Starting frontend...${NC}"
    cd frontend
    npm run dev -- --host &
    FRONTEND_PID=$!
    cd ..

    sleep 3

    # Start ngrok for frontend
    ngrok http 5173 --log=stdout > /tmp/ngrok-frontend.log 2>&1 &
    NGROK_FRONTEND_PID=$!

    sleep 3

    # Get the frontend ngrok URL
    FRONTEND_URL=$(curl -s http://localhost:4041/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

    if [ -z "$FRONTEND_URL" ]; then
        # Try the first ngrok instance's additional tunnel
        FRONTEND_URL="http://$LOCAL_IP:5173"
    fi

    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${GREEN}Development servers are running!${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e ""
    echo -e "🌐 ${GREEN}Public URLs (share these):${NC}"
    echo -e "   Frontend: $FRONTEND_URL"
    echo -e "   Signaling: $SIGNAL_URL"
    echo -e ""
    echo -e "📱 ${GREEN}Local network:${NC}"
    echo -e "   http://$LOCAL_IP:5173"
    echo -e ""
    echo -e "Press Ctrl+C to stop all servers"
fi

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $SIGNAL_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    kill $NGROK_SIGNAL_PID 2>/dev/null || true
    kill $NGROK_FRONTEND_PID 2>/dev/null || true
    rm -f frontend/.env.local
    echo -e "${GREEN}Done!${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait forever
wait
