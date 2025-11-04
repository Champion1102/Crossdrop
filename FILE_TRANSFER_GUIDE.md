# File Transfer Guide

## Overview

CrossDrop implements simple TCP-based file transfer between devices on the same LAN.

## How It Works

1. **TCP Server** (Receiver): Automatically starts on port 9000 when the backend starts
2. **TCP Client** (Sender): Connects to target IP and sends file
3. **Logging**: All transfers are logged to `logs/transfer_logs.json`

## API Endpoints

### 1. Send File
**POST** `/transfer/send-file`

Send a file to another device.

**Request Body:**
```json
{
  "target_ip": "10.7.8.187",
  "file_path": "/path/to/file.txt"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "File sent successfully to 10.7.8.187",
  "filename": "file.txt",
  "file_size": 1024,
  "duration_seconds": 0.5,
  "target_ip": "10.7.8.187"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/transfer/send-file \
  -H "Content-Type: application/json" \
  -d '{
    "target_ip": "10.7.8.187",
    "file_path": "/Users/ritesh/Documents/test.txt"
  }'
```

### 2. Start Receiver (Already Running)
**GET** `/transfer/receive`

The receiver starts automatically when the server starts, but you can check its status here.

**Response:**
```json
{
  "status": "active",
  "message": "File receiver is running",
  "port": 9000,
  "local_ip": "10.7.8.187",
  "received_count": 0
}
```

### 3. Transfer Status
**GET** `/transfer/status`

Get the current transfer service status.

### 4. Transfer History
**GET** `/transfer/history`

Get all logged file transfers.

**Response:**
```json
{
  "transfers": [
    {
      "timestamp": "2024-01-15T10:30:45.123456",
      "sender_ip": "10.7.11.246",
      "receiver_ip": "10.7.8.187",
      "filename": "test.txt",
      "file_size": 1024,
      "file_size_mb": 0.001,
      "duration_seconds": 0.5,
      "status": "success",
      "transfer_rate_mbps": 0.002
    }
  ],
  "total": 1,
  "updated_at": "2024-01-15T10:30:45.123456"
}
```

## How to Use

### On Device 1 (Sender):
1. Make sure backend is running
2. Send a file:
   ```bash
   curl -X POST http://localhost:8000/transfer/send-file \
     -H "Content-Type: application/json" \
     -d '{
       "target_ip": "10.7.11.246",
       "file_path": "/path/to/your/file.txt"
     }'
   ```

### On Device 2 (Receiver):
1. Make sure backend is running (receiver starts automatically)
2. The file will be saved to `received_files/` directory
3. Check status:
   ```bash
   curl http://localhost:8000/transfer/status
   ```
4. View received files:
   ```bash
   ls received_files/
   ```

## File Locations

- **Received files**: `backend/fastapi_app/received_files/`
- **Transfer logs**: `backend/fastapi_app/logs/transfer_logs.json`

## Testing

Run the test script:
```bash
cd backend/fastapi_app
python3 test_transfer.py
```

## Transfer Protocol

1. **Sender** connects to receiver's IP on port 9000
2. **Sender** sends file metadata (JSON): `{"filename": "...", "size": ...}`
3. **Receiver** acknowledges with "OK"
4. **Sender** sends file in 8KB chunks
5. **Receiver** saves file to `received_files/`
6. Both sides log the transfer

## Notes

- **No encryption yet** - files are sent in plain binary
- **TCP socket** - reliable, connection-based transfer
- **Automatic logging** - all transfers are logged with timestamps
- **Error handling** - failed transfers are also logged
- **Background receiver** - runs automatically, no need to start manually

## Troubleshooting

**Connection refused?**
- Make sure receiver's backend is running
- Check firewall allows port 9000
- Verify target IP is correct

**File not received?**
- Check `received_files/` directory exists
- Check transfer logs for errors
- Verify both devices are on same network

**Transfer slow?**
- Large files transfer in 8KB chunks
- Network speed depends on WiFi quality
- Check transfer logs for actual speed

