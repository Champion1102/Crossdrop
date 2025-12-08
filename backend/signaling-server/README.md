# 🔌 Crossdrop Signaling Server

WebSocket signaling server for peer-to-peer WebRTC connections in Crossdrop.

## 📖 Overview

This server facilitates WebRTC connection setup between peers. It:
- Manages room creation and joining
- Routes WebRTC signaling messages (SDP offers/answers, ICE candidates)
- Tracks connected peers and active rooms
- Handles heartbeat/keepalive for connection health
- Provides HTTP endpoints for health checks and stats

**Note:** This server does NOT handle file transfers. Files are transferred directly peer-to-peer via WebRTC DataChannels.

---

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Development mode with debug logging
npm run dev
```

Server runs on `http://localhost:3001` by default.

### Production

```bash
# Set environment variables
export PORT=10000
export NODE_ENV=production
export LOG_LEVEL=info

# Start server
npm start
```

---

## 📡 API Endpoints

### HTTP Endpoints

#### `GET /health`
Health check endpoint for monitoring.

#### `GET /stats`
Detailed statistics (includes peer information).

#### `GET /room/:roomId`
Check if a room exists.

### WebSocket Endpoint

#### `WS /ws?name=DeviceName`
WebSocket connection for signaling.

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Logging level |
| `CORS_ORIGIN` | `*` | CORS allowed origins |

---

## 🚀 Deployment

See the main project `DEPLOYMENT_GUIDE.md` for complete deployment instructions.

Quick deploy to Render:
1. Push code to GitHub
2. Create new Web Service on Render
3. Set root directory to `backend/signaling-server`
4. Add environment variables
5. Deploy!

---

## 📝 License

MIT License - Part of the Crossdrop project
