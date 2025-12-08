/**
 * Server Setup
 * HTTP server with WebSocket upgrade and health checks
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const config = require('./config');
const { logger } = require('./utils');
const { peerService, roomService } = require('./services');
const { handleConnection } = require('./handlers');

let server = null;
let wss = null;
let heartbeatInterval = null;
let cleanupInterval = null;

/**
 * Create and configure the server
 * @returns {http.Server}
 */
function createServer() {
  // HTTP server for health checks and CORS preflight
  server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', config.cors.origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.url === '/health' || req.url === '/') {
      const stats = {
        status: 'ok',
        uptime: process.uptime(),
        peers: peerService.getPeerCount(),
        rooms: roomService.getStats(),
        timestamp: new Date().toISOString(),
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end(JSON.stringify(stats));
      return;
    }

    // Stats endpoint
    if (req.url === '/stats') {
      const stats = {
        peers: peerService.getAllPeers(),
        rooms: roomService.getStats(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end(JSON.stringify(stats));
      return;
    }

    // Room check endpoint - check if a room exists
    if (req.url.startsWith('/room/')) {
      const roomId = req.url.split('/room/')[1];
      const exists = roomService.roomExists(roomId);

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end(JSON.stringify({ exists, roomId }));
      return;
    }

    // 404 for other routes
    res.writeHead(404, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // WebSocket server
  wss = new WebSocketServer({
    server,
    path: config.ws.path,
    maxPayload: config.ws.maxPayloadSize,
  });

  wss.on('connection', handleConnection);

  wss.on('error', (err) => {
    logger.error('WebSocket server error', { error: err.message });
  });

  return server;
}

/**
 * Start heartbeat interval
 * Pings all clients and removes unresponsive ones
 */
function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    // First, check for unresponsive peers from last round
    const unresponsive = peerService.getUnresponsivePeers();
    for (const peerId of unresponsive) {
      const peer = peerService.getPeer(peerId);
      if (peer) {
        logger.info('Removing unresponsive peer', { peerId });

        // Notify room
        if (peer.roomId) {
          peerService.broadcastToRoom(peer.roomId, peerId, {
            type: 'peer-left',
            peerId,
            reason: 'timeout',
          });
        }

        // Close connection
        if (peer.ws.readyState === 1) {
          peer.ws.close(1000, 'Heartbeat timeout');
        }

        peerService.removePeer(peerId);
      }
    }

    // Mark all peers as not alive before ping
    peerService.markAllNotAlive();

    // Send ping to all connected clients
    if (wss) {
      wss.clients.forEach((ws) => {
        if (ws.readyState === 1) {
          try {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          } catch (err) {
            // Ignore send errors
          }
        }
      });
    }
  }, config.heartbeat.interval);

  logger.info('Heartbeat started', { interval: config.heartbeat.interval });
}

/**
 * Start cleanup interval
 * Removes stale peers that haven't had activity
 */
function startCleanup() {
  cleanupInterval = setInterval(() => {
    const stalePeers = peerService.getStalePeers();

    for (const peerId of stalePeers) {
      const peer = peerService.getPeer(peerId);
      if (peer) {
        logger.info('Removing stale peer', { peerId });

        // Notify room
        if (peer.roomId) {
          peerService.broadcastToRoom(peer.roomId, peerId, {
            type: 'peer-left',
            peerId,
            reason: 'stale',
          });
        }

        // Close connection
        if (peer.ws.readyState === 1) {
          peer.ws.close(1000, 'Connection timeout');
        }

        peerService.removePeer(peerId);
      }
    }
  }, config.cleanup.interval);

  logger.info('Cleanup started', { interval: config.cleanup.interval });
}

/**
 * Start the server
 * @returns {Promise<http.Server>}
 */
function start() {
  return new Promise((resolve, reject) => {
    if (!server) {
      createServer();
    }

    server.listen(config.port, config.host, () => {
      logger.info('Server started', {
        host: config.host,
        port: config.port,
        wsPath: config.ws.path,
      });

      startHeartbeat();
      startCleanup();

      resolve(server);
    });

    server.on('error', (err) => {
      logger.error('Server error', { error: err.message });
      reject(err);
    });
  });
}

/**
 * Stop the server gracefully
 * @returns {Promise<void>}
 */
function stop() {
  return new Promise((resolve) => {
    logger.info('Shutting down server...');

    // Clear intervals
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    // Notify all connected clients
    if (wss) {
      wss.clients.forEach((ws) => {
        if (ws.readyState === 1) {
          try {
            ws.send(JSON.stringify({ type: 'server-shutdown' }));
            ws.close(1001, 'Server shutting down');
          } catch (err) {
            // Ignore errors during shutdown
          }
        }
      });

      wss.close(() => {
        logger.info('WebSocket server closed');
      });
    }

    // Close HTTP server
    if (server) {
      server.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  createServer,
  start,
  stop,
};
