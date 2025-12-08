/**
 * ID Generation Utilities
 * Simple, readable IDs for peers and rooms
 */

const crypto = require('crypto');

/**
 * Generate a random peer ID
 * Format: peer_xxxxxxxxxxxx (12 random hex chars)
 */
function generatePeerId() {
  return `peer_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Generate a random room ID
 * Format: room_xxxxxxxxxxxx (12 random hex chars)
 */
function generateRoomId() {
  return `room_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Generate a short random ID
 * Useful for request tracking
 */
function generateShortId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Validate peer ID format
 */
function isValidPeerId(id) {
  return typeof id === 'string' && /^peer_[a-f0-9]{12}$/.test(id);
}

/**
 * Validate room ID format
 */
function isValidRoomId(id) {
  return typeof id === 'string' && /^room_[a-f0-9]{12}$/.test(id);
}

module.exports = {
  generatePeerId,
  generateRoomId,
  generateShortId,
  isValidPeerId,
  isValidRoomId,
};
