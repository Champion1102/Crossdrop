/**
 * Signaling API for WebRTC coordination
 * Used for browser-to-browser file transfers
 */

import config from '../config';

// Get signaling server URLs
const getSignalingUrls = () => {
  // Use VITE_SIGNALING_URL if set, otherwise fallback based on environment
  if (import.meta.env.VITE_SIGNALING_URL) {
    const baseUrl = import.meta.env.VITE_SIGNALING_URL;
    const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    return { httpUrl: baseUrl, wsUrl };
  }

  // Development: Use same hostname with signaling port
  if (import.meta.env.DEV) {
    const httpUrl = `http://${window.location.hostname}:3001`;
    const wsUrl = `ws://${window.location.hostname}:3001`;
    return { httpUrl, wsUrl };
  }

  // Production: Assume signaling is on same domain or use default
  const protocol = window.location.protocol;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const httpUrl = `${protocol}//${window.location.host}/signaling`;
  const wsUrl = `${wsProtocol}//${window.location.host}/signaling`;
  return { httpUrl, wsUrl };
};

const { httpUrl: SIGNALING_SERVER_URL, wsUrl: WS_SIGNALING_URL } = getSignalingUrls();

/**
 * Join a room via HTTP
 * @param {string} roomId - The room ID to join
 * @param {string} deviceName - Device name to display
 * @returns {Promise<{status, peerId, roomId, existingPeers}>}
 */
export const joinRoom = async (roomId, deviceName = 'Browser Device') => {
  try {
    const response = await fetch(`${SIGNALING_SERVER_URL}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId, deviceName }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to join room`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error joining room:', error);
    throw error;
  }
};

/**
 * Get list of active rooms
 * @returns {Promise<{rooms: Array}>}
 */
export const getRooms = async () => {
  try {
    const response = await fetch(`${SIGNALING_SERVER_URL}/rooms`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to get rooms`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting rooms:', error);
    throw error;
  }
};

/**
 * Check signaling server health
 * @returns {Promise<{status, connections, rooms}>}
 */
export const checkHealth = async () => {
  try {
    const response = await fetch(`${SIGNALING_SERVER_URL}/health`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Signaling server unhealthy`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error checking health:', error);
    throw error;
  }
};

/**
 * Create a WebSocket connection to the signaling server
 * @param {Object} options - Connection options
 * @param {Function} options.onOpen - Called when connection opens
 * @param {Function} options.onMessage - Called with parsed message data
 * @param {Function} options.onClose - Called when connection closes
 * @param {Function} options.onError - Called on error
 * @returns {WebSocket} The WebSocket connection
 */
export const createWebSocketConnection = ({
  onOpen = () => {},
  onMessage = () => {},
  onClose = () => {},
  onError = () => {}
} = {}) => {
  const ws = new WebSocket(WS_SIGNALING_URL);

  ws.onopen = () => {
    console.log('WebSocket connected to signaling server');
    onOpen(ws);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data, ws);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  ws.onclose = (event) => {
    console.log('WebSocket disconnected:', event.code, event.reason);
    onClose(event);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    onError(error);
  };

  return ws;
};

/**
 * Send a message through the WebSocket
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} message - Message to send (will be JSON stringified)
 */
export const sendMessage = (ws, message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error('WebSocket not open, cannot send message');
  }
};

/**
 * Generate a unique room ID
 * @returns {string} A random room ID
 */
export const generateRoomId = () => {
  // Generate a 6-character alphanumeric room ID
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Export URLs for debugging
export const getUrls = () => ({ SIGNALING_SERVER_URL, WS_SIGNALING_URL });
