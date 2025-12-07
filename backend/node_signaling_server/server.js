const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store rooms and peer connections
// rooms: Map<roomId, Map<peerId, { ws, deviceName, joinedAt }>>
const rooms = new Map();

// Store WebSocket to peer mapping for quick lookup
// wsToInfo: Map<ws, { roomId, peerId, deviceName }>
const wsToInfo = new Map();

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
        joinedAt: peerInfo.joinedAt
      });
    }
  });
  return peers;
};

// Helper: Send message to a specific peer
const sendToPeer = (roomId, peerId, message) => {
  const room = rooms.get(roomId);
  if (!room) return false;

  const peerInfo = room.get(peerId);
  if (!peerInfo || peerInfo.ws.readyState !== WebSocket.OPEN) return false;

  peerInfo.ws.send(JSON.stringify(message));
  return true;
};

// Helper: Broadcast to all peers in a room except sender
const broadcastToRoom = (roomId, message, excludePeerId = null) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.forEach((peerInfo, peerId) => {
    if (peerId !== excludePeerId && peerInfo.ws.readyState === WebSocket.OPEN) {
      peerInfo.ws.send(JSON.stringify(message));
    }
  });
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
  res.json({
    status: 'healthy',
    connections: wss.clients.size,
    rooms: rooms.size
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data.type);

      switch (data.type) {
        // Join a room via WebSocket
        case 'join': {
          const { roomId, peerId, deviceName } = data;

          if (!roomId || !peerId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'roomId and peerId are required'
            }));
            return;
          }

          // Create room if doesn't exist
          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
            console.log(`Room ${roomId} created via WebSocket`);
          }

          const room = rooms.get(roomId);

          // Add peer to room
          room.set(peerId, {
            ws,
            deviceName: deviceName || 'Unknown Device',
            joinedAt: new Date().toISOString()
          });

          // Store ws -> info mapping
          wsToInfo.set(ws, { roomId, peerId, deviceName });

          const peers = getPeersInRoom(roomId, peerId);

          // Confirm join to sender
          ws.send(JSON.stringify({
            type: 'joined',
            roomId,
            peerId,
            peers
          }));

          // Notify others in the room (send full peer list excluding the receiver)
          const allPeersExceptNew = getPeersInRoom(roomId, peerId);
          room.forEach((peerInfo, existingPeerId) => {
            if (existingPeerId !== peerId && peerInfo.ws.readyState === WebSocket.OPEN) {
              // Send to existing peer: include the new peer but exclude the receiver (existing peer)
              const peersForThisPeer = getPeersInRoom(roomId, existingPeerId);
              peerInfo.ws.send(JSON.stringify({
                type: 'peer-joined',
                peerId,
                deviceName: deviceName || 'Unknown Device',
                peers: peersForThisPeer
              }));
            }
          });

          console.log(`Peer ${peerId} (${deviceName}) joined room ${roomId}. Total peers: ${room.size}`);
          console.log('Current peers in room:', Array.from(room.keys()));
          break;
        }

        // WebRTC signaling: SDP Offer
        case 'offer': {
          const { targetPeerId, sdp, roomId, fromPeerId, fromDeviceName } = data;

          if (!targetPeerId || !sdp || !roomId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'targetPeerId, sdp, and roomId are required for offer'
            }));
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
            ws.send(JSON.stringify({
              type: 'error',
              message: `Peer ${targetPeerId} not found or disconnected`
            }));
          } else {
            console.log(`Forwarded offer from ${fromPeerId} to ${targetPeerId}`);
          }
          break;
        }

        // WebRTC signaling: SDP Answer
        case 'answer': {
          const { targetPeerId, sdp, roomId, fromPeerId, fromDeviceName } = data;

          if (!targetPeerId || !sdp || !roomId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'targetPeerId, sdp, and roomId are required for answer'
            }));
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
            ws.send(JSON.stringify({
              type: 'error',
              message: `Peer ${targetPeerId} not found or disconnected`
            }));
          } else {
            console.log(`Forwarded answer from ${fromPeerId} to ${targetPeerId}`);
          }
          break;
        }

        // WebRTC signaling: ICE Candidate
        case 'ice-candidate': {
          const { targetPeerId, candidate, roomId, fromPeerId } = data;

          if (!targetPeerId || !candidate || !roomId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'targetPeerId, candidate, and roomId are required'
            }));
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
            ws.send(JSON.stringify({
              type: 'error',
              message: 'targetPeerId, roomId, and fileInfo are required'
            }));
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
            ws.send(JSON.stringify({
              type: 'error',
              message: `Peer ${targetPeerId} not available`
            }));
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

        // Ping/Pong for connection keep-alive
        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        }

        default:
          console.log('Unknown message type:', data.type);
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${data.type}`
          }));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON message'
      }));
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

// Periodic cleanup of stale connections
setInterval(() => {
  wsToInfo.forEach((info, ws) => {
    if (ws.readyState !== WebSocket.OPEN) {
      removePeerFromRoom(info.roomId, info.peerId);
      wsToInfo.delete(ws);
      console.log(`Cleaned up stale connection for peer ${info.peerId}`);
    }
  });
}, 30000); // Every 30 seconds

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`HTTP endpoints: /join, /rooms, /health`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});
