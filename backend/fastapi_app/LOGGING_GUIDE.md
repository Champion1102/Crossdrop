# Logging Guide for CrossDrop

## Overview
Comprehensive logging has been added throughout the CrossDrop backend to help debug connection request issues.

## Log Locations

1. **Console Logs**: Real-time logs appear in your terminal where you run `uvicorn`
2. **File Logs**: Detailed logs saved to `logs/app.log` (created automatically)

## Log Levels

- **INFO**: Normal operations (connection requests, peer discovery)
- **DEBUG**: Detailed information (request IDs, IP addresses)
- **WARNING**: Unexpected but non-critical issues
- **ERROR**: Critical errors with full stack traces

## Key Log Messages to Watch For

### When Sending a Connection Request:
```
📤 Connection request received for peer: <IP>
  From: <Device Name> (<Local IP>)
  To: <Peer IP>
  ✓ Peer found: <Peer Name>
  ✓ Created local request: <Request ID>
  📡 Attempting to send request to: http://<Peer IP>:8000/connections/incoming-request
  ✓ HTTP POST successful: Status 200
  ✅ Connection request successfully delivered to <Peer IP>
```

### If Connection Fails:
```
✗ Connection failed to <Peer IP>:8000 - <Error Details>
  Error details: <Full Stack Trace>
  ℹ Request stored locally. Target device will poll for requests.
```

### When Receiving a Connection Request:
```
📥 Incoming connection request received
  Request ID: <Request ID>
  From: <Device Name> (<IP>)
  To: <Device Name> (<IP>)
  ✅ Request stored successfully. Total pending: <Count>
```

## Debug Endpoint

Access detailed status at: `http://localhost:8000/debug/status`

This shows:
- Local IP and device name
- Discovery service status
- All discovered peers
- All connections
- All pending requests (with details)

## Common Issues to Check

### 1. Connection Request Not Reaching Target
**Look for**: `✗ Connection failed` or `✗ Timeout`
**Possible Causes**:
- Firewall blocking port 8000
- Network segmentation (different subnets)
- Target device not running backend
- IP address mismatch

**Solution**: Check if you can reach `http://<Peer IP>:8000/debug/status` from browser

### 2. Request Received But Not Showing
**Look for**: `📥 Incoming connection request received` and `✅ Request stored`
**Check**: 
- Is `to_ip` matching the local IP?
- Are requests being filtered out?

**Use**: `/debug/status` endpoint to see all pending requests

### 3. Requests Being Lost
**Check**: Log file `logs/app.log` for detailed traceback
**Look for**: Any ERROR messages with stack traces

## Testing Connection Requests

1. **Device 1**: Send connection request
   - Watch console for: `📤 Connection request received`
   - Check for: `✅ Connection request successfully delivered`

2. **Device 2**: Should see incoming request
   - Watch console for: `📥 Incoming connection request received`
   - Check: `/debug/status` shows request in `pending_requests`

3. **Verify**: 
   - Device 1: Check logs show successful POST
   - Device 2: Check logs show incoming POST received

## Network Troubleshooting

If requests aren't reaching the target:

1. **Test HTTP connectivity**:
   ```bash
   curl http://<Peer IP>:8000/debug/status
   ```

2. **Check firewall**:
   - macOS: System Settings > Network > Firewall
   - Linux: `sudo ufw status`
   - Windows: Windows Defender Firewall

3. **Verify IP addresses**:
   - Both devices should see each other in discovery
   - Use `/debug/status` to confirm IPs match

## Log File Rotation

Logs are written to `logs/app.log`. For long-running servers, consider:
- Log rotation (handled by Python logging)
- Regular cleanup of old logs
- Monitoring log file size

