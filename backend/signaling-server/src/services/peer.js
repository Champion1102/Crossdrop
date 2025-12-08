/**
 * Peer Service
 * Manages peer connections and their state
 */

const config = require('../config');
const { logger, generatePeerId } = require('../utils');
const roomService = require('./room');

/**
 * Peer structure:
 * {
 *   id: string,
 *   ws: WebSocket,
 *   roomId: string | null,
 *   name: string,
 *   lastActivity: number,
 *   isAlive: boolean,
 *   iceCandidateQueue: Map<targetPeerId, candidate[]>
 * }
 */

// Peer storage: Map<peerId, Peer>
const peers = new Map();

// Reverse lookup: Map<WebSocket, peerId>
const wsToPeer = new WeakMap();

/**
 * Create and register a new peer
 * @param {WebSocket} ws
 * @param {string} name - Display name
 * @returns {object} peer object
 */
function createPeer(ws, name = 'Anonymous') {
  const id = generatePeerId();

  const peer = {
    id,
    ws,
    roomId: null,
    name: name.slice(0, 50), // Limit name length
    lastActivity: Date.now(),
    isAlive: true,
    iceCandidateQueue: new Map(), // Queue ICE candidates until remote description is set
  };

  peers.set(id, peer);
  wsToPeer.set(ws, id);

  logger.info('Peer created', { peerId: id, name: peer.name });
  return peer;
}

/**
 * Get peer by ID
 * @param {string} peerId
 * @returns {object|null}
 */
function getPeer(peerId) {
  return peers.get(peerId) || null;
}

/**
 * Get peer by WebSocket
 * @param {WebSocket} ws
 * @returns {object|null}
 */
function getPeerByWs(ws) {
  const peerId = wsToPeer.get(ws);
  return peerId ? peers.get(peerId) : null;
}

/**
 * Update peer's last activity timestamp
 * @param {string} peerId
 */
function updateActivity(peerId) {
  const peer = peers.get(peerId);
  if (peer) {
    peer.lastActivity = Date.now();
    peer.isAlive = true;
  }
}

/**
 * Mark peer as alive (for heartbeat)
 * @param {string} peerId
 */
function markAlive(peerId) {
  const peer = peers.get(peerId);
  if (peer) {
    peer.isAlive = true;
  }
}

/**
 * Join a room
 * @param {string} peerId
 * @param {string} roomId
 * @returns {string[]} other peers in room
 */
function joinRoom(peerId, roomId) {
  const peer = peers.get(peerId);
  if (!peer) {
    throw new Error('Peer not found');
  }

  // Leave current room if in one
  if (peer.roomId) {
    roomService.leaveRoom(peer.roomId, peerId);
  }

  // Join new room
  const otherPeers = roomService.joinRoom(roomId, peerId);
  peer.roomId = roomId;

  return otherPeers;
}

/**
 * Leave current room
 * @param {string} peerId
 */
function leaveRoom(peerId) {
  const peer = peers.get(peerId);
  if (!peer || !peer.roomId) return;

  roomService.leaveRoom(peer.roomId, peerId);
  peer.roomId = null;
}

/**
 * Remove peer completely
 * @param {string} peerId
 * @returns {object|null} removed peer
 */
function removePeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer) return null;

  // Leave room
  if (peer.roomId) {
    roomService.leaveRoom(peer.roomId, peerId);
  }

  // Remove from storage
  peers.delete(peerId);
  logger.info('Peer removed', { peerId });

  return peer;
}

/**
 * Remove peer by WebSocket
 * @param {WebSocket} ws
 * @returns {object|null} removed peer
 */
function removePeerByWs(ws) {
  const peer = getPeerByWs(ws);
  if (!peer) return null;
  return removePeer(peer.id);
}

/**
 * Send message to a peer
 * @param {string} peerId
 * @param {object} message
 * @returns {boolean} success
 */
function sendToPeer(peerId, message) {
  const peer = peers.get(peerId);
  if (!peer || peer.ws.readyState !== 1) { // 1 = OPEN
    return false;
  }

  try {
    peer.ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    logger.error('Failed to send message to peer', { peerId, error: err.message });
    return false;
  }
}

/**
 * Broadcast to all peers in a room except sender
 * @param {string} roomId
 * @param {string} senderId
 * @param {object} message
 */
function broadcastToRoom(roomId, senderId, message) {
  const peerIds = roomService.getOtherPeers(roomId, senderId);

  for (const peerId of peerIds) {
    sendToPeer(peerId, message);
  }
}

/**
 * Queue ICE candidate for a peer (until they set remote description)
 * @param {string} peerId - The peer who should receive the candidate
 * @param {string} fromPeerId - The peer who sent the candidate
 * @param {object} candidate
 */
function queueIceCandidate(peerId, fromPeerId, candidate) {
  const peer = peers.get(peerId);
  if (!peer) return;

  if (!peer.iceCandidateQueue.has(fromPeerId)) {
    peer.iceCandidateQueue.set(fromPeerId, []);
  }
  peer.iceCandidateQueue.get(fromPeerId).push(candidate);
}

/**
 * Get and clear queued ICE candidates
 * @param {string} peerId - The peer receiving candidates
 * @param {string} fromPeerId - The peer who sent the candidates
 * @returns {object[]} queued candidates
 */
function getQueuedIceCandidates(peerId, fromPeerId) {
  const peer = peers.get(peerId);
  if (!peer) return [];

  const queue = peer.iceCandidateQueue.get(fromPeerId) || [];
  peer.iceCandidateQueue.delete(fromPeerId);
  return queue;
}

/**
 * Get all connected peers (for admin/stats)
 * @returns {object[]}
 */
function getAllPeers() {
  return Array.from(peers.values()).map(p => ({
    id: p.id,
    name: p.name,
    roomId: p.roomId,
    lastActivity: p.lastActivity,
  }));
}

/**
 * Get stale peers (no activity within timeout)
 * @returns {string[]} peer IDs
 */
function getStalePeers() {
  const now = Date.now();
  const stale = [];

  for (const [peerId, peer] of peers.entries()) {
    if (now - peer.lastActivity > config.cleanup.peerTimeout) {
      stale.push(peerId);
    }
  }

  return stale;
}

/**
 * Get peers that didn't respond to ping
 * @returns {string[]} peer IDs
 */
function getUnresponsivePeers() {
  const unresponsive = [];

  for (const [peerId, peer] of peers.entries()) {
    if (!peer.isAlive) {
      unresponsive.push(peerId);
    }
  }

  return unresponsive;
}

/**
 * Mark all peers as not alive (before ping round)
 */
function markAllNotAlive() {
  for (const peer of peers.values()) {
    peer.isAlive = false;
  }
}

/**
 * Get peer count
 * @returns {number}
 */
function getPeerCount() {
  return peers.size;
}

/**
 * Get public peer info (safe to send to other peers)
 * @param {string} peerId
 * @returns {object|null}
 */
function getPublicPeerInfo(peerId) {
  const peer = peers.get(peerId);
  if (!peer) return null;

  return {
    id: peer.id,
    name: peer.name,
  };
}

module.exports = {
  createPeer,
  getPeer,
  getPeerByWs,
  updateActivity,
  markAlive,
  joinRoom,
  leaveRoom,
  removePeer,
  removePeerByWs,
  sendToPeer,
  broadcastToRoom,
  queueIceCandidate,
  getQueuedIceCandidates,
  getAllPeers,
  getStalePeers,
  getUnresponsivePeers,
  markAllNotAlive,
  getPeerCount,
  getPublicPeerInfo,
};
