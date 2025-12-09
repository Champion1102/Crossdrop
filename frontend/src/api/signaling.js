/**
 * Signaling API for WebRTC coordination
 * Used for browser-to-browser file transfers
 */

import config from '../config';

// Get signaling server URLs
const getSignalingUrls = () => {
  if (import.meta.env.VITE_SIGNALING_URL) {
    const baseUrl = import.meta.env.VITE_SIGNALING_URL;
    const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    return { httpUrl: baseUrl, wsUrl };
  }

  if (import.meta.env.DEV) {
    const httpUrl = `http://${window.location.hostname}:3001`;
    const wsUrl = `ws://${window.location.hostname}:3001`;
    return { httpUrl, wsUrl };
  }

  const protocol = window.location.protocol;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const httpUrl = `${protocol}//${window.location.host}/signaling`;
  const wsUrl = `${wsProtocol}//${window.location.host}/signaling`;
  return { httpUrl, wsUrl };
};

const { httpUrl: SIGNALING_SERVER_URL, wsUrl: WS_SIGNALING_URL } = getSignalingUrls();

const FETCH_TIMEOUT = 30000; // 30s to handle Render cold starts

/**
 * Fetch with retry and timeout — handles Render free tier cold starts
 */
const fetchWithRetry = async (url, options = {}, retries = 3, backoff = 3000) => {
  let lastError;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Retry on 5xx (server errors / cold start issues)
      if (response.status >= 500 && attempt < retries - 1) {
        lastError = new Error(`HTTP ${response.status}`);
        await new Promise(r => setTimeout(r, backoff * (attempt + 1)));
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error;

      if (error.name === 'AbortError') {
        lastError = new Error('Request timed out — server may be starting up');
      }

      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, backoff * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError;
};

/**
 * Wake up the signaling server (fire-and-forget)
 * Call this early on page load to minimize cold start delays
 */
export const wakeUpServer = () => {
  fetch(`${SIGNALING_SERVER_URL}/health`).catch(() => {});
};

/**
 * Join a room via HTTP
 */
export const joinRoom = async (roomId, deviceName = 'Browser Device') => {
  const response = await fetchWithRetry(`${SIGNALING_SERVER_URL}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, deviceName }),
  });

  return await response.json();
};

/**
 * Get list of active rooms
 */
export const getRooms = async () => {
  const response = await fetchWithRetry(`${SIGNALING_SERVER_URL}/rooms`);
  return await response.json();
};

/**
 * Check signaling server health (with retry for cold starts)
 */
export const checkHealth = async () => {
  const response = await fetchWithRetry(
    `${SIGNALING_SERVER_URL}/health`,
    {},
    3,   // 3 retries
    5000  // 5s between retries (gives server time to wake)
  );
  return await response.json();
};

/**
 * Create a WebSocket connection to the signaling server
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
 */
export const generateRoomId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const getUrls = () => ({ SIGNALING_SERVER_URL, WS_SIGNALING_URL });
