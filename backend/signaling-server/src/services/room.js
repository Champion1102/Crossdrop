/**
 * Room Service
 * Manages rooms and their peer memberships
 */

const config = require('../config');
const { logger, generateRoomId } = require('../utils');

// Room storage: Map<roomId, Set<peerId>>
const rooms = new Map();

/**
 * Create a new room
 * @returns {string} roomId
 */
function createRoom() {
  if (rooms.size >= config.rooms.maxRooms) {
    throw new Error('Maximum room limit reached');
  }

  const roomId = generateRoomId();
  rooms.set(roomId, new Set());
  logger.info('Room created', { roomId });
  return roomId;
}

/**
 * Get or create a room by ID
 * @param {string} roomId
 * @returns {Set<string>} peers in room
 */
function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    if (rooms.size >= config.rooms.maxRooms) {
      throw new Error('Maximum room limit reached');
    }
    rooms.set(roomId, new Set());
    logger.info('Room created', { roomId });
  }
  return rooms.get(roomId);
}

/**
 * Add a peer to a room
 * @param {string} roomId
 * @param {string} peerId
 * @returns {string[]} list of other peers in room
 */
function joinRoom(roomId, peerId) {
  const room = getOrCreateRoom(roomId);

  if (room.size >= config.rooms.maxPeersPerRoom) {
    throw new Error('Room is full');
  }

  // Get existing peers before adding new one
  const existingPeers = Array.from(room);

  room.add(peerId);
  logger.info('Peer joined room', { roomId, peerId, peerCount: room.size });

  return existingPeers;
}

/**
 * Remove a peer from a room
 * @param {string} roomId
 * @param {string} peerId
 * @returns {boolean} true if room was deleted (empty)
 */
function leaveRoom(roomId, peerId) {
  const room = rooms.get(roomId);
  if (!room) return false;

  room.delete(peerId);
  logger.info('Peer left room', { roomId, peerId, peerCount: room.size });

  // Clean up empty rooms
  if (room.size === 0) {
    rooms.delete(roomId);
    logger.info('Room deleted (empty)', { roomId });
    return true;
  }

  return false;
}

/**
 * Get all peers in a room
 * @param {string} roomId
 * @returns {string[]} peer IDs
 */
function getPeersInRoom(roomId) {
  const room = rooms.get(roomId);
  return room ? Array.from(room) : [];
}

/**
 * Get all peers in a room except one
 * @param {string} roomId
 * @param {string} excludePeerId
 * @returns {string[]} peer IDs
 */
function getOtherPeers(roomId, excludePeerId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room).filter(id => id !== excludePeerId);
}

/**
 * Check if a room exists
 * @param {string} roomId
 * @returns {boolean}
 */
function roomExists(roomId) {
  return rooms.has(roomId);
}

/**
 * Get room statistics
 * @returns {object}
 */
function getStats() {
  let totalPeers = 0;
  for (const room of rooms.values()) {
    totalPeers += room.size;
  }
  return {
    roomCount: rooms.size,
    totalPeers,
    maxRooms: config.rooms.maxRooms,
    maxPeersPerRoom: config.rooms.maxPeersPerRoom,
  };
}

/**
 * Remove a peer from all rooms they're in
 * @param {string} peerId
 * @returns {string[]} room IDs the peer was removed from
 */
function removeFromAllRooms(peerId) {
  const removedFrom = [];

  for (const [roomId, room] of rooms.entries()) {
    if (room.has(peerId)) {
      room.delete(peerId);
      removedFrom.push(roomId);

      if (room.size === 0) {
        rooms.delete(roomId);
        logger.info('Room deleted (empty)', { roomId });
      }
    }
  }

  if (removedFrom.length > 0) {
    logger.info('Peer removed from all rooms', { peerId, rooms: removedFrom });
  }

  return removedFrom;
}

module.exports = {
  createRoom,
  getOrCreateRoom,
  joinRoom,
  leaveRoom,
  getPeersInRoom,
  getOtherPeers,
  roomExists,
  getStats,
  removeFromAllRooms,
};
