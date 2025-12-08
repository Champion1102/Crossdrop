/**
 * Connection Handler
 * Handles WebSocket connection lifecycle
 */

const config = require('../config');
const { logger } = require('../utils');
const { peerService } = require('../services');
const { handleMessage } = require('./message');

/**
 * Handle new WebSocket connection
 * @param {WebSocket} ws
 * @param {http.IncomingMessage} req
 */
function handleConnection(ws, req) {
  // Get client IP for logging
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  // Get name from query string if provided
  const url = new URL(req.url, `http://${req.headers.host}`);
  const name = url.searchParams.get('name') || 'Anonymous';

  // Create peer
  const peer = peerService.createPeer(ws, name);
  const peerLogger = logger.child({ peerId: peer.id });

  peerLogger.info('Client connected', { clientIp });

  // Send welcome message with peer ID
  sendJson(ws, {
    type: 'welcome',
    peerId: peer.id,
    name: peer.name,
  });

  // Handle incoming messages
  ws.on('message', (data) => {
    const message = data.toString();

    // Size check
    if (message.length > config.ws.maxPayloadSize) {
      sendJson(ws, { type: 'error', error: 'Message too large' });
      return;
    }

    const response = handleMessage(peer, message);

    if (response) {
      sendJson(ws, response);
    }
  });

  // Handle connection close
  ws.on('close', (code, reason) => {
    peerLogger.info('Client disconnected', {
      code,
      reason: reason?.toString() || 'none',
    });

    // Notify peers in the same room
    if (peer.roomId) {
      peerService.broadcastToRoom(peer.roomId, peer.id, {
        type: 'peer-left',
        peerId: peer.id,
      });
    }

    // Clean up
    peerService.removePeer(peer.id);
  });

  // Handle errors
  ws.on('error', (err) => {
    peerLogger.error('WebSocket error', { error: err.message });
  });
}

/**
 * Send JSON message to WebSocket
 * @param {WebSocket} ws
 * @param {object} data
 */
function sendJson(ws, data) {
  if (ws.readyState === 1) { // OPEN
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      logger.error('Failed to send message', { error: err.message });
    }
  }
}

module.exports = {
  handleConnection,
};
