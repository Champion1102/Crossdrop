# CrossDrop Signaling Server

WebSocket-based signaling server for CrossDrop file sharing system.

## Features

- WebSocket connections for real-time signaling
- HTTP endpoints for room management (`/join`, `/signal`)
- CORS enabled for frontend communication

## Setup

```bash
npm install
npm start
```

Server runs on port 3001 by default.

## Endpoints

- `POST /join` - Join a signaling room
- `POST /signal` - Send signaling data between peers

