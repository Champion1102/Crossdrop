const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// CORS configuration for production
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(express.json());

// Trust proxy for production deployments behind load balancers
app.set('trust proxy', 1);

const server = http.createServer(app);

// WebSocket server with configuration for production
const wss = new WebSocket.Server({
  server,
  // Verify client on connection (optional authentication)
  verifyClient: (info, callback) => {
    // Add any authentication logic here if needed
    callback(true);
  },
  // Handle protocol upgrades properly
  handleProtocols: (protocols) => {
    return protocols[0] || false;
  }
});

// Configuration
const CONFIG = {
  // Ping/Pong intervals
  PING_INTERVAL: 25000,        // Send ping every 25 seconds
  PONG_TIMEOUT: 10000,         // Close connection if no pong in 10 seconds

  // Cleanup intervals
  STALE_CHECK_INTERVAL: 30000, // Check for stale connections every 30 seconds

  // Connection limits
  MAX_PEERS_PER_ROOM: 10,      // Maximum peers in a room
  MAX_ROOMS: 100,              // Maximum concurrent rooms

  // Timeouts
  CONNECTION_TIMEOUT: 60000,   // Consider connection stale after 60 seconds of no activity
};

// Store rooms and peer connections
// rooms: Map<roomId, Map<peerId, { ws, deviceName, joinedAt, lastActivity, isAlive }>>
const rooms = new Map();

// Store WebSocket to peer mapping for quick lookup
// wsToInfo: Map<ws, { roomId, peerId, deviceName, lastPing, isAlive }>
const wsToInfo = new Map();

// Server start time for uptime tracking
const serverStartTime = Date.now();

// Helper: Get all peers in a room except the sender
const getPeersInRoom = (roomId, excludePeerId = null) => {
  const room = rooms.get(roomId);
  if (!room) return [];

  const peers = [];
  room.forEach((peerInfo, peerId) => {
    if (peerId !== excludePeerId) {
      peers.push({
        peerId,
        deviceName: peerInfo.deviceName,
        joinedAt: peerInfo.joinedAt,
        isConnected: peerInfo.ws?.readyState === WebSocket.OPEN
      });
    }
  });
  return peers;
};

// Helper: Update last activity timestamp
const updateActivity = (ws) => {
  const info = wsToInfo.get(ws);
  if (info) {
    info.lastActivity = Date.now();
    info.isAlive = true;

    // Also update in rooms map
    const room = rooms.get(info.roomId);
    if (room) {
      const peerInfo = room.get(info.peerId);
      if (peerInfo) {
        peerInfo.lastActivity = Date.now();
        peerInfo.isAlive = true;
      }
    }
  }
};

// Helper: Safe JSON send with error handling
const safeSend = (ws, message) => {
  if (ws?.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message:', error.message);
      return false;
    }
  }
  return false;
};

// Helper: Send message to a specific peer
const sendToPeer = (roomId, peerId, message) => {
  const room = rooms.get(roomId);
  if (!room) return false;

  const peerInfo = room.get(peerId);
  if (!peerInfo) return false;

  return safeSend(peerInfo.ws, message);
};

// Helper: Broadcast to all peers in a room except sender
const broadcastToRoom = (roomId, message, excludePeerId = null) => {
  const room = rooms.get(roomId);
  if (!room) return 0;

  let sentCount = 0;
  room.forEach((peerInfo, peerId) => {
    if (peerId !== excludePeerId) {
      if (safeSend(peerInfo.ws, message)) {
        sentCount++;
      }
    }
  });
  return sentCount;
};

// Helper: Remove peer from room
const removePeerFromRoom = (roomId, peerId) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.delete(peerId);

  // Notify others that peer left
  broadcastToRoom(roomId, {
    type: 'peer-left',
    peerId,
    peers: getPeersInRoom(roomId)
  });

  // Clean up empty rooms
  if (room.size === 0) {
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted (empty)`);
  }
};

// HTTP endpoint: /join - Join or create a room
app.post('/join', (req, res) => {
  const { roomId, deviceName } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: 'roomId is required' });
  }

  // Generate a unique peer ID
  const peerId = uuidv4();

  // Create room if it doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
    console.log(`Room ${roomId} created`);
  }

  const room = rooms.get(roomId);
  const peers = getPeersInRoom(roomId);

  res.json({
    status: 'success',
    message: 'Ready to connect via WebSocket',
    roomId,
    peerId,
    existingPeers: peers
  });
});

// HTTP endpoint: /rooms - List all active rooms
app.get('/rooms', (req, res) => {
  const roomList = [];
  rooms.forEach((peers, roomId) => {
    roomList.push({
      roomId,
      peerCount: peers.size,
      peers: getPeersInRoom(roomId)
    });
  });
  res.json({ rooms: roomList });
});

// HTTP endpoint: /health - Health check
app.get('/health', (req, res) => {
  const now = Date.now();
  const uptime = Math.floor((now - serverStartTime) / 1000);

  // Count active connections (those that responded to ping recently)
  let activeConnections = 0;
  let staleConnections = 0;

  wsToInfo.forEach((info) => {
    if (info.lastActivity && (now - info.lastActivity) < CONFIG.CONNECTION_TIMEOUT) {
      activeConnections++;
    } else {
      staleConnections++;
    }
  });

  res.json({
    status: 'healthy',
    timestamp: now,
    uptime,
    connections: {
      total: wss.clients.size,
      active: activeConnections,
      stale: staleConnections
    },
    rooms: {
      count: rooms.size,
      maxAllowed: CONFIG.MAX_ROOMS
    },
    config: {
      pingInterval: CONFIG.PING_INTERVAL,
      maxPeersPerRoom: CONFIG.MAX_PEERS_PER_ROOM
    }
  });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`New WebSocket connection from ${clientIp}`);

  // Initialize connection state
  ws.isAlive = true;
  ws.lastActivity = Date.now();

  // Setup native WebSocket ping/pong handling
  ws.on('pong', () => {
    ws.isAlive = true;
    ws.lastActivity = Date.now();
    updateActivity(ws);
  });

  ws.on('message', (message) => {
    // Update activity on any message
    ws.lastActivity = Date.now();
    updateActivity(ws);

    try {
      const data = JSON.parse(message);
      console.log('Received:', data.type);

      switch (data.type) {
        // Join a room via WebSocket
        case 'join': {
          const { roomId, peerId, deviceName } = data;

          if (!roomId || !peerId) {
            safeSend(ws, {
              type: 'error',
              message: 'roomId and peerId are required'
            });
            return;
          }

          // Check room limits
          if (!rooms.has(roomId) && rooms.size >= CONFIG.MAX_ROOMS) {
            safeSend(ws, {
              type: 'error',
              message: 'Maximum number of rooms reached. Please try again later.'
            });
            return;
          }

          // Create room if doesn't exist
          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
            console.log(`Room ${roomId} created via WebSocket`);
          }

          const room = rooms.get(roomId);

          // Check if this is a reconnection (same peerId)
          const isReconnection = room.has(peerId);

          // Check peer limit (only for new peers, not reconnections)
          if (!isReconnection && room.size >= CONFIG.MAX_PEERS_PER_ROOM) {
            safeSend(ws, {
              type: 'error',
              message: `Room is full. Maximum ${CONFIG.MAX_PEERS_PER_ROOM} peers allowed.`
            });
            return;
          }

          const now = Date.now();
          const peerDeviceName = deviceName || 'Unknown Device';

          // Add/update peer in room
          room.set(peerId, {
            ws,
            deviceName: peerDeviceName,
            joinedAt: isReconnection ? room.get(peerId)?.joinedAt : new Date().toISOString(),
            lastActivity: now,
            isAlive: true
          });

          // Store ws -> info mapping
          wsToInfo.set(ws, {
            roomId,
            peerId,
            deviceName: peerDeviceName,
            lastActivity: now,
            isAlive: true
          });

          const peers = getPeersInRoom(roomId, peerId);

          // Confirm join to sender
          safeSend(ws, {
            type: 'joined',
            roomId,
            peerId,
            peers,
            isReconnection
          });

          // Notify others in the room
          room.forEach((peerInfo, existingPeerId) => {
            if (existingPeerId !== peerId) {
              // Send to existing peer with their personalized peer list
              const peersForThisPeer = getPeersInRoom(roomId, existingPeerId);
              safeSend(peerInfo.ws, {
                type: isReconnection ? 'peer-reconnected' : 'peer-joined',
                peerId,
                deviceName: peerDeviceName,
                peers: peersForThisPeer
              });
            }
          });

          console.log(`Peer ${peerId} (${peerDeviceName}) ${isReconnection ? 'reconnected to' : 'joined'} room ${roomId}. Total peers: ${room.size}`);
          break;
        }

        // WebRTC signaling: SDP Offer
        case 'offer': {
          const { targetPeerId, sdp, roomId, fromPeerId, fromDeviceName } = data;

          if (!targetPeerId || !sdp || !roomId) {
            safeSend(ws, {
              type: 'error',
              message: 'targetPeerId, sdp, and roomId are required for offer'
            });
            return;
          }

          // Forward offer to target peer
          const sent = sendToPeer(roomId, targetPeerId, {
            type: 'offer',
            sdp,
            fromPeerId,
            fromDeviceName
          });

          if (!sent) {
            safeSend(ws, {
              type: 'error',
              message: `Peer ${targetPeerId} not found or disconnected`
            });
          } else {
            console.log(`Forwarded offer from ${fromPeerId} to ${targetPeerId}`);
          }
          break;
        }

        // WebRTC signaling: SDP Answer
        case 'answer': {
          const { targetPeerId, sdp, roomId, fromPeerId, fromDeviceName } = data;

          if (!targetPeerId || !sdp || !roomId) {
            safeSend(ws, {
              type: 'error',
              message: 'targetPeerId, sdp, and roomId are required for answer'
            });
            return;
          }

          // Forward answer to target peer
          const sent = sendToPeer(roomId, targetPeerId, {
            type: 'answer',
            sdp,
            fromPeerId,
            fromDeviceName
          });

          if (!sent) {
            safeSend(ws, {
              type: 'error',
              message: `Peer ${targetPeerId} not found or disconnected`
            });
          } else {
            console.log(`Forwarded answer from ${fromPeerId} to ${targetPeerId}`);
          }
          break;
        }

        // WebRTC signaling: ICE Candidate
        case 'ice-candidate': {
          const { targetPeerId, candidate, roomId, fromPeerId } = data;

          if (!targetPeerId || !candidate || !roomId) {
            safeSend(ws, {
              type: 'error',
              message: 'targetPeerId, candidate, and roomId are required'
            });
            return;
          }

          // Forward ICE candidate to target peer
          const sent = sendToPeer(roomId, targetPeerId, {
            type: 'ice-candidate',
            candidate,
            fromPeerId
          });

          if (sent) {
            console.log(`Forwarded ICE candidate from ${fromPeerId} to ${targetPeerId}`);
          }
          break;
        }

        // File transfer request (for coordination)
        case 'file-request': {
          const { targetPeerId, roomId, fromPeerId, fromDeviceName, fileInfo } = data;

          if (!targetPeerId || !roomId || !fileInfo) {
            safeSend(ws, {
              type: 'error',
              message: 'targetPeerId, roomId, and fileInfo are required'
            });
            return;
          }

          // Forward file request to target peer
          const sent = sendToPeer(roomId, targetPeerId, {
            type: 'file-request',
            fromPeerId,
            fromDeviceName,
            fileInfo
          });

          if (!sent) {
            safeSend(ws, {
              type: 'error',
              message: `Peer ${targetPeerId} not available`
            });
          } else {
            console.log(`File request from ${fromPeerId} to ${targetPeerId}: ${fileInfo.name}`);
          }
          break;
        }

        // File transfer accepted
        case 'file-accept': {
          const { targetPeerId, roomId, fromPeerId, fileInfo } = data;

          sendToPeer(roomId, targetPeerId, {
            type: 'file-accept',
            fromPeerId,
            fileInfo
          });
          console.log(`File accept from ${fromPeerId} to ${targetPeerId}`);
          break;
        }

        // File transfer rejected
        case 'file-reject': {
          const { targetPeerId, roomId, fromPeerId, reason } = data;

          sendToPeer(roomId, targetPeerId, {
            type: 'file-reject',
            fromPeerId,
            reason
          });
          console.log(`File reject from ${fromPeerId} to ${targetPeerId}: ${reason}`);
          break;
        }

        // Leave room
        case 'leave': {
          const info = wsToInfo.get(ws);
          if (info) {
            removePeerFromRoom(info.roomId, info.peerId);
            wsToInfo.delete(ws);
            console.log(`Peer ${info.peerId} left room ${info.roomId}`);
          }
          break;
        }

        // Application-level Ping/Pong for connection keep-alive
        case 'ping': {
          ws.isAlive = true;
          safeSend(ws, { type: 'pong', timestamp: data.timestamp || Date.now() });
          break;
        }

        default:
          console.log('Unknown message type:', data.type);
          safeSend(ws, {
            type: 'error',
            message: `Unknown message type: ${data.type}`
          });
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      safeSend(ws, {
        type: 'error',
        message: 'Invalid JSON message'
      });
    }
  });

  ws.on('close', () => {
    // Clean up when connection closes
    const info = wsToInfo.get(ws);
    if (info) {
      removePeerFromRoom(info.roomId, info.peerId);
      wsToInfo.delete(ws);
      console.log(`WebSocket closed for peer ${info.peerId} in room ${info.roomId}`);
    } else {
      console.log('WebSocket connection closed (no room joined)');
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Server-side ping interval - proactively check all connections
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      // Connection didn't respond to last ping - terminate it
      console.log('Terminating unresponsive connection');
      const info = wsToInfo.get(ws);
      if (info) {
        removePeerFromRoom(info.roomId, info.peerId);
        wsToInfo.delete(ws);
      }
      return ws.terminate();
    }

    // Mark as not alive and send ping - will be marked alive on pong
    ws.isAlive = false;

    // Send WebSocket protocol-level ping
    try {
      ws.ping();
    } catch (error) {
      console.error('Error sending ping:', error.message);
    }
  });
}, CONFIG.PING_INTERVAL);

// Periodic cleanup of stale connections
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleanedUp = 0;

  wsToInfo.forEach((info, ws) => {
    // Check if connection is closed or stale
    const isStale = ws.readyState !== WebSocket.OPEN ||
      (info.lastActivity && (now - info.lastActivity) > CONFIG.CONNECTION_TIMEOUT);

    if (isStale) {
      removePeerFromRoom(info.roomId, info.peerId);
      wsToInfo.delete(ws);
      cleanedUp++;

      // Force close if still open
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.close(1000, 'Connection timeout');
        } catch (e) {
          ws.terminate();
        }
      }
    }
  });

  if (cleanedUp > 0) {
    console.log(`Cleaned up ${cleanedUp} stale connection(s)`);
  }

  // Also clean up empty rooms
  rooms.forEach((room, roomId) => {
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`Removed empty room: ${roomId}`);
    }
  });
}, CONFIG.STALE_CHECK_INTERVAL);

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');

  clearInterval(pingInterval);
  clearInterval(cleanupInterval);

  // Notify all connected clients
  wss.clients.forEach((ws) => {
    safeSend(ws, { type: 'server-shutdown', message: 'Server is restarting' });
    ws.close(1001, 'Server shutdown');
  });

  // Close the WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');

    // Close the HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Don't exit - try to keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - try to keep running
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Signaling server running on port ${PORT}`);
  console.log(`📡 HTTP endpoints: /join, /rooms, /health`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`⚙️  Config: Ping every ${CONFIG.PING_INTERVAL/1000}s, Max ${CONFIG.MAX_PEERS_PER_ROOM} peers/room, Max ${CONFIG.MAX_ROOMS} rooms\n`);
});
