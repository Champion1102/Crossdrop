#!/bin/bash
# Watch for discovered peers - updates every 2 seconds
echo "Watching for discovered peers (Ctrl+C to stop)..."
echo ""

while true; do
    clear
    echo "════════════════════════════════════════"
    echo "Discovered Peers - $(date '+%H:%M:%S')"
    echo "════════════════════════════════════════"
    curl -s http://localhost:8000/discover/peers | python3 -m json.tool 2>/dev/null || echo "Error: Server not running?"
    echo ""
    echo "Press Ctrl+C to stop..."
    sleep 2
done

