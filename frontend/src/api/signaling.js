const SIGNALING_SERVER_URL = 'http://localhost:3001';
const WS_SIGNALING_URL = 'ws://localhost:3001';

export const joinRoom = async (roomId, userId) => {
  try {
    const response = await fetch(`${SIGNALING_SERVER_URL}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId, userId }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error joining room:', error);
    throw error;
  }
};

export const sendSignal = async (roomId, signal, from, to) => {
  try {
    const response = await fetch(`${SIGNALING_SERVER_URL}/signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId, signal, from, to }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error sending signal:', error);
    throw error;
  }
};

export const createWebSocketConnection = (url = WS_SIGNALING_URL) => {
  const ws = new WebSocket(url);
  return ws;
};

