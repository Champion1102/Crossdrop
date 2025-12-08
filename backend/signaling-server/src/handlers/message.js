/**
 * Message Handlers
 * Handle all WebSocket message types for WebRTC signaling
 */

const { logger } = require('../utils');
const { peerService, roomService } = require('../services');

/**
 * Message type handlers
 * Each handler receives (peer, payload) and returns a response or null
 */
const handlers = {
  /**
   * Join a room
   * Payload: { roomId: string, name?: string }
   * Response: { peers: [{ id, name }] }
   */
  join: (peer, payload) => {
    const { roomId, name } = payload;

    if (!roomId || typeof roomId !== 'string') {
      return { type: 'error', error: 'roomId is required' };
    }

    // Update peer name if provided
    if (name) {
      peer.name = String(name).slice(0, 50);
    }

    try {
      // Join room and get other peers
      const otherPeerIds = peerService.joinRoom(peer.id, roomId);

      // Get public info of other peers
      const peers = otherPeerIds
        .map(id => peerService.getPublicPeerInfo(id))
        .filter(Boolean);

      // Notify other peers about the new peer
      peerService.broadcastToRoom(roomId, peer.id, {
        type: 'peer-joined',
        peer: peerService.getPublicPeerInfo(peer.id),
      });

      logger.debug('Peer joined room', { peerId: peer.id, roomId, peerCount: peers.length + 1 });

      return {
        type: 'joined',
        roomId,
        peerId: peer.id,
        peers,
      };
    } catch (err) {
      logger.error('Failed to join room', { peerId: peer.id, roomId, error: err.message });
      return { type: 'error', error: err.message };
    }
  },

  /**
   * Leave current room
   */
  leave: (peer) => {
    if (!peer.roomId) {
      return { type: 'error', error: 'Not in a room' };
    }

    const roomId = peer.roomId;

    // Notify other peers
    peerService.broadcastToRoom(roomId, peer.id, {
      type: 'peer-left',
      peerId: peer.id,
    });

    peerService.leaveRoom(peer.id);

    return { type: 'left', roomId };
  },

  /**
   * WebRTC SDP Offer
   * Payload: { targetPeerId: string, sdp: object }
   */
  offer: (peer, payload) => {
    const { targetPeerId, sdp } = payload;

    if (!targetPeerId || !sdp) {
      return { type: 'error', error: 'targetPeerId and sdp are required' };
    }

    const targetPeer = peerService.getPeer(targetPeerId);
    if (!targetPeer) {
      return { type: 'error', error: 'Target peer not found' };
    }

    // Forward offer to target peer
    const sent = peerService.sendToPeer(targetPeerId, {
      type: 'offer',
      fromPeerId: peer.id,
      fromPeerName: peer.name,
      sdp,
    });

    if (!sent) {
      return { type: 'error', error: 'Failed to send offer' };
    }

    logger.debug('Offer forwarded', { from: peer.id, to: targetPeerId });
    return null; // No response needed
  },

  /**
   * WebRTC SDP Answer
   * Payload: { targetPeerId: string, sdp: object }
   */
  answer: (peer, payload) => {
    const { targetPeerId, sdp } = payload;

    if (!targetPeerId || !sdp) {
      return { type: 'error', error: 'targetPeerId and sdp are required' };
    }

    const targetPeer = peerService.getPeer(targetPeerId);
    if (!targetPeer) {
      return { type: 'error', error: 'Target peer not found' };
    }

    // Forward answer to target peer
    const sent = peerService.sendToPeer(targetPeerId, {
      type: 'answer',
      fromPeerId: peer.id,
      sdp,
    });

    if (!sent) {
      return { type: 'error', error: 'Failed to send answer' };
    }

    // Send any queued ICE candidates to the answerer
    // (These were received before the answer was sent)
    const queuedCandidates = peerService.getQueuedIceCandidates(peer.id, targetPeerId);
    if (queuedCandidates.length > 0) {
      logger.debug('Sending queued ICE candidates', {
        to: peer.id,
        from: targetPeerId,
        count: queuedCandidates.length,
      });

      for (const candidate of queuedCandidates) {
        peerService.sendToPeer(peer.id, {
          type: 'ice-candidate',
          fromPeerId: targetPeerId,
          candidate,
        });
      }
    }

    logger.debug('Answer forwarded', { from: peer.id, to: targetPeerId });
    return null;
  },

  /**
   * ICE Candidate
   * Payload: { targetPeerId: string, candidate: object }
   */
  'ice-candidate': (peer, payload) => {
    const { targetPeerId, candidate } = payload;

    if (!targetPeerId) {
      return { type: 'error', error: 'targetPeerId is required' };
    }

    const targetPeer = peerService.getPeer(targetPeerId);
    if (!targetPeer) {
      return { type: 'error', error: 'Target peer not found' };
    }

    // Forward ICE candidate
    const sent = peerService.sendToPeer(targetPeerId, {
      type: 'ice-candidate',
      fromPeerId: peer.id,
      candidate,
    });

    if (!sent) {
      // Queue candidate if peer is temporarily unavailable
      peerService.queueIceCandidate(targetPeerId, peer.id, candidate);
    }

    logger.debug('ICE candidate forwarded', { from: peer.id, to: targetPeerId });
    return null;
  },

  /**
   * Signal that remote description is set (ready for ICE candidates)
   * Payload: { targetPeerId: string }
   */
  'ready-for-candidates': (peer, payload) => {
    const { targetPeerId } = payload;

    if (!targetPeerId) {
      return { type: 'error', error: 'targetPeerId is required' };
    }

    // Get and send queued ICE candidates
    const queuedCandidates = peerService.getQueuedIceCandidates(peer.id, targetPeerId);

    if (queuedCandidates.length > 0) {
      logger.debug('Sending queued ICE candidates', {
        to: peer.id,
        from: targetPeerId,
        count: queuedCandidates.length,
      });

      for (const candidate of queuedCandidates) {
        peerService.sendToPeer(peer.id, {
          type: 'ice-candidate',
          fromPeerId: targetPeerId,
          candidate,
        });
      }
    }

    return null;
  },

  /**
   * File transfer request
   * Payload: { targetPeerId: string, fileInfo: { name, size, type } }
   */
  'file-request': (peer, payload) => {
    const { targetPeerId, fileInfo } = payload;

    if (!targetPeerId || !fileInfo) {
      return { type: 'error', error: 'targetPeerId and fileInfo are required' };
    }

    const targetPeer = peerService.getPeer(targetPeerId);
    if (!targetPeer) {
      return { type: 'error', error: 'Target peer not found' };
    }

    peerService.sendToPeer(targetPeerId, {
      type: 'file-request',
      fromPeerId: peer.id,
      fromPeerName: peer.name,
      fileInfo,
    });

    logger.debug('File request forwarded', { from: peer.id, to: targetPeerId, fileName: fileInfo.name });
    return null;
  },

  /**
   * Accept file transfer
   * Payload: { targetPeerId: string }
   */
  'file-accept': (peer, payload) => {
    const { targetPeerId } = payload;

    if (!targetPeerId) {
      return { type: 'error', error: 'targetPeerId is required' };
    }

    peerService.sendToPeer(targetPeerId, {
      type: 'file-accept',
      fromPeerId: peer.id,
    });

    logger.debug('File accept forwarded', { from: peer.id, to: targetPeerId });
    return null;
  },

  /**
   * Reject file transfer
   * Payload: { targetPeerId: string, reason?: string }
   */
  'file-reject': (peer, payload) => {
    const { targetPeerId, reason } = payload;

    if (!targetPeerId) {
      return { type: 'error', error: 'targetPeerId is required' };
    }

    peerService.sendToPeer(targetPeerId, {
      type: 'file-reject',
      fromPeerId: peer.id,
      reason: reason || 'Declined',
    });

    logger.debug('File reject forwarded', { from: peer.id, to: targetPeerId });
    return null;
  },

  /**
   * Ping (heartbeat)
   */
  ping: (peer) => {
    peerService.updateActivity(peer.id);
    return { type: 'pong', timestamp: Date.now() };
  },

  /**
   * Pong (heartbeat response)
   */
  pong: (peer) => {
    peerService.markAlive(peer.id);
    peerService.updateActivity(peer.id);
    return null;
  },
};

/**
 * Process an incoming message
 * @param {object} peer - Peer object
 * @param {string} rawMessage - Raw JSON string
 * @returns {object|null} Response to send back
 */
function handleMessage(peer, rawMessage) {
  let message;

  try {
    message = JSON.parse(rawMessage);
  } catch (err) {
    logger.warn('Invalid JSON message', { peerId: peer.id });
    return { type: 'error', error: 'Invalid JSON' };
  }

  const { type, ...payload } = message;

  if (!type || typeof type !== 'string') {
    return { type: 'error', error: 'Message type is required' };
  }

  const handler = handlers[type];
  if (!handler) {
    logger.warn('Unknown message type', { peerId: peer.id, type });
    return { type: 'error', error: `Unknown message type: ${type}` };
  }

  // Update activity on any message
  peerService.updateActivity(peer.id);

  try {
    return handler(peer, payload);
  } catch (err) {
    logger.error('Handler error', { type, peerId: peer.id, error: err.message });
    return { type: 'error', error: 'Internal server error' };
  }
}

module.exports = {
  handleMessage,
  handlers,
};
