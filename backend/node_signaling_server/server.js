const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store rooms and connections
const rooms = new Map();

// HTTP endpoint: /join
app.post('/join', (req, res) => {
  const { roomId, userId } = req.body;
  
  if (!roomId || !userId) {
    return res.status(400).json({ error: 'roomId and userId are required' });
  }

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  rooms.get(roomId).add(userId);
  
  res.json({ 
    status: 'success', 
    message: 'Joined room',
    roomId,
    userId 
  });
});

// HTTP endpoint: /signal
app.post('/signal', (req, res) => {
  const { roomId, signal, from, to } = req.body;
  
  if (!roomId || !signal) {
    return res.status(400).json({ error: 'roomId and signal are required' });
  }

  // Broadcast signal to room (in real implementation, would route to specific peer)
  res.json({ 
    status: 'success', 
    message: 'Signal received',
    roomId 
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);
      
      // Echo back for now
      ws.send(JSON.stringify({ 
        type: 'echo', 
        data: data 
      }));
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});

