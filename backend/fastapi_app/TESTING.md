# Testing Device Discovery

This guide shows you how to test the UDP broadcast device discovery feature.

## Prerequisites

1. Install dependencies:
```bash
cd backend/fastapi_app
pip install -r requirements.txt
```

2. Make sure you're on a local network (LAN) - devices need to be on the same network to discover each other.

## Option 1: Quick Manual Testing (Single Device)

### Step 1: Start the Server
```bash
cd backend/fastapi_app
uvicorn main:app --reload
```

The server will start and immediately begin:
- Broadcasting your device every 2 seconds
- Listening for other devices
- The discovery service runs in background threads

### Step 2: Test the Endpoints

Open a **new terminal** and run these commands:

```bash
# Check if server is running
curl http://localhost:8000/

# Check discovery status (shows your device info)
curl http://localhost:8000/discover/status

# Get list of discovered peers (empty initially)
curl http://localhost:8000/discover/peers

# Check peer logs
cat logs/peers.json
```

**Expected Output:**
- `/discover/status` should show your IP, device name, and `"status": "active"`
- `/discover/peers` should return `{"peers": [], "count": 0}` (no peers yet)

## Option 2: Test with Multiple Devices (Real Discovery)

### Setup

**Device 1 (Your Main Machine):**
```bash
cd backend/fastapi_app
uvicorn main:app --port 8000 --reload
```

**Device 2 (Another device on same LAN - different computer, phone hotspot, etc.):**
```bash
cd backend/fastapi_app
uvicorn main:app --port 8001 --reload
```

**OR use the same machine with different port (less realistic but works for testing):**
```bash
# Terminal 1
uvicorn main:app --port 8000 --reload

# Terminal 2 (change the BROADCAST_PORT in discovery_service.py temporarily, or use different network interface)
```

### What Should Happen

1. Within 2-4 seconds, both devices should discover each other
2. Each device broadcasts its presence every 2 seconds
3. Each device listens for broadcasts from others
4. Peers are automatically removed after 6 seconds of inactivity

### Verify Discovery

**On Device 1:**
```bash
curl http://localhost:8000/discover/peers
```

**On Device 2:**
```bash
curl http://localhost:8001/discover/peers
```

**Expected:** Both should show each other in the peers list:
```json
{
  "peers": [
    {
      "ip": "192.168.1.105",
      "device_name": "device-name (Darwin)",
      "last_seen": "2024-01-15T10:30:45.123456"
    }
  ],
  "count": 1
}
```

### Check Logs

```bash
cat logs/peers.json
```

The logs file updates automatically whenever peers are discovered or removed.

## Option 3: Automated Testing Script

Run the automated test script:

```bash
cd backend/fastapi_app
python3 test_discovery.py
```

This script will:
- Test all endpoints
- Show your device status
- Monitor for peers for 10 seconds
- Display discovered devices
- Check the logs file

## Troubleshooting

### No peers discovered?

1. **Check network**: Make sure devices are on the same LAN
   ```bash
   # Check your IP
   ifconfig | grep "inet "
   # or
   ip addr show
   ```

2. **Check firewall**: UDP port 8888 might be blocked
   ```bash
   # macOS: Check if firewall is blocking
   # Allow Python/uvicorn in System Settings > Network > Firewall
   ```

3. **Check server is running**: Verify the discovery service started
   ```bash
   curl http://localhost:8000/discover/status
   # Should show "status": "active"
   ```

4. **Check logs**: Look for errors in the terminal where uvicorn is running

5. **Test broadcast manually**:
   ```python
   # Python shell
   import socket
   sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
   sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
   sock.sendto(b'{"test": "message"}', ('255.255.255.255', 8888))
   ```

### Port already in use?

```bash
# Find what's using port 8000
lsof -i :8000
# Kill it
kill -9 <PID>
```

### Check what's happening

Watch the terminal where uvicorn is running - you should see normal FastAPI logs. If there are errors about sockets or broadcasts, the network utilities might need adjustment for your system.

## Expected Behavior

- ✅ Discovery starts automatically when server starts
- ✅ Broadcasts every 2 seconds (no console output - silent)
- ✅ Discovers peers within 2-4 seconds
- ✅ Removes inactive peers after 6 seconds
- ✅ Logs to `logs/peers.json` automatically
- ✅ Thread-safe (multiple requests won't cause issues)

## Next Steps

Once discovery is working, you can:
1. Build the frontend to display discovered devices
2. Implement file transfer using the discovered IP addresses
3. Add device filtering/selection UI

