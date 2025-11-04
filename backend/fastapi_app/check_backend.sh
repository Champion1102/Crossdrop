#!/bin/bash
# Quick script to check if backend is running properly

echo "🔍 Checking if backend is accessible..."
echo ""

# Check localhost
echo "1. Testing localhost:8000..."
if curl -s http://localhost:8000/ > /dev/null; then
    echo "   ✅ Backend is running locally"
else
    echo "   ❌ Backend is NOT running on localhost:8000"
    echo "   → Start it with: uvicorn main:app --reload --host 0.0.0.0 --port 8000"
    exit 1
fi

# Check network interface
LOCAL_IP=$(python3 -c "from utils.network_utils import get_local_ip; print(get_local_ip())" 2>/dev/null)
echo ""
echo "2. Your local IP: $LOCAL_IP"
echo ""

# Check if accessible from network
echo "3. Testing network accessibility..."
if curl -s http://$LOCAL_IP:8000/ > /dev/null; then
    echo "   ✅ Backend is accessible from network"
else
    echo "   ❌ Backend is NOT accessible from network"
    echo "   → Make sure uvicorn is started with --host 0.0.0.0"
    echo "   → Check firewall settings"
fi

echo ""
echo "4. Backend status:"
curl -s http://localhost:8000/discover/status | python3 -m json.tool 2>/dev/null || echo "   Could not get status"

echo ""
echo "✅ If all checks pass, other devices should be able to connect!"

