#!/bin/bash
# Script to start the CrossDrop backend server correctly

cd "$(dirname "$0")"

echo "🚀 Starting CrossDrop Backend..."
echo ""
echo "⚠️  IMPORTANT: Make sure to use --host 0.0.0.0 so other devices can connect!"
echo ""

# Check if uvicorn is installed
if ! command -v uvicorn &> /dev/null; then
    echo "❌ uvicorn not found. Installing dependencies..."
    pip install -r requirements.txt
fi

# Start server with correct host binding
echo "Starting server on http://0.0.0.0:8000"
echo "Accessible from other devices on your network"
echo ""
echo "Press Ctrl+C to stop"
echo ""

uvicorn main:app --reload --host 0.0.0.0 --port 8000

