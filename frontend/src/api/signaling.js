/**
 * Signaling API helpers for Crossdrop
 */

import config from '../config';

/**
 * Get signaling server URLs
 */
export const getSignalingUrls = () => {
  const baseUrl = config.SIGNALING_URL || `http://${window.location.hostname}:3001`;
  const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  return { httpUrl: baseUrl, wsUrl };
};

/**
 * Check signaling server health
 */
export const checkHealth = async () => {
  const { httpUrl } = getSignalingUrls();

  const response = await fetch(`${httpUrl}/health`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
};

/**
 * Generate a random room ID (6 alphanumeric characters)
 */
export const generateRoomId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Check if a room exists
 */
export const checkRoomExists = async (roomId) => {
  const { httpUrl } = getSignalingUrls();

  const response = await fetch(`${httpUrl}/room/${roomId}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Room check failed: ${response.status}`);
  }

  const data = await response.json();
  return data.exists;
};
