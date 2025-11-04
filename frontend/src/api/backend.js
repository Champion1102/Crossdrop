import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const discoverDevices = async () => {
  try {
    const response = await api.get('/discover');
    return response.data;
  } catch (error) {
    console.error('Error discovering devices:', error);
    throw error;
  }
};

export const getDiscoveredPeers = async () => {
  try {
    const response = await api.get('/discover/peers');
    return response.data;
  } catch (error) {
    console.error('Error getting peers:', error);
    throw error;
  }
};

export const getDiscoveryStatus = async () => {
  try {
    const response = await api.get('/discover/status');
    return response.data;
  } catch (error) {
    console.error('Error getting discovery status:', error);
    throw error;
  }
};

export const startDiscovery = async () => {
  try {
    const response = await api.post('/discover/start');
    return response.data;
  } catch (error) {
    console.error('Error starting discovery:', error);
    throw error;
  }
};

export const stopDiscovery = async () => {
  try {
    const response = await api.post('/discover/stop');
    return response.data;
  } catch (error) {
    console.error('Error stopping discovery:', error);
    throw error;
  }
};

export const sendFile = async (fileData) => {
  try {
    const response = await api.post('/send', fileData);
    return response.data;
  } catch (error) {
    console.error('Error sending file:', error);
    throw error;
  }
};

export const receiveFile = async (fileData) => {
  try {
    const response = await api.post('/receive', fileData);
    return response.data;
  } catch (error) {
    console.error('Error receiving file:', error);
    throw error;
  }
};

export const aiChat = async (message) => {
  try {
    const response = await api.post('/ai', { message });
    return response.data;
  } catch (error) {
    console.error('Error with AI chat:', error);
    throw error;
  }
};

// Connection Management
export const requestConnection = async (peerIp) => {
  try {
    const response = await api.post('/connections/request', { peer_ip: peerIp });
    return response.data;
  } catch (error) {
    console.error('Error requesting connection:', error);
    throw error;
  }
};

export const getPendingRequests = async () => {
  try {
    const response = await api.get('/connections/pending');
    return response.data;
  } catch (error) {
    console.error('Error getting pending requests:', error);
    throw error;
  }
};

export const acceptConnection = async (requestId) => {
  try {
    const response = await api.post('/connections/accept', { request_id: requestId });
    return response.data;
  } catch (error) {
    console.error('Error accepting connection:', error);
    throw error;
  }
};

export const rejectConnection = async (requestId) => {
  try {
    const response = await api.post('/connections/reject', { request_id: requestId });
    return response.data;
  } catch (error) {
    console.error('Error rejecting connection:', error);
    throw error;
  }
};

export const getConnections = async () => {
  try {
    const response = await api.get('/connections/list');
    return response.data;
  } catch (error) {
    console.error('Error getting connections:', error);
    throw error;
  }
};

export const disconnect = async (peerIp) => {
  try {
    const response = await api.post('/connections/disconnect', { peer_ip: peerIp });
    return response.data;
  } catch (error) {
    console.error('Error disconnecting:', error);
    throw error;
  }
};

export const getConnectionStatus = async (peerIp) => {
  try {
    const response = await api.get(`/connections/status/${peerIp}`);
    return response.data;
  } catch (error) {
    console.error('Error getting connection status:', error);
    throw error;
  }
};

// File Transfer
export const sendFileToDevice = async (targetIp, filePath) => {
  try {
    const response = await api.post('/transfer/send-file', {
      target_ip: targetIp,
      file_path: filePath
    });
    return response.data;
  } catch (error) {
    console.error('Error sending file:', error);
    throw error;
  }
};

export const getTransferHistory = async () => {
  try {
    const response = await api.get('/transfer/history');
    return response.data;
  } catch (error) {
    console.error('Error getting transfer history:', error);
    throw error;
  }
};

export const getLogs = async () => {
  try {
    const response = await api.get('/transfer/logs');
    return response.data;
  } catch (error) {
    console.error('Error getting logs:', error);
    throw error;
  }
};

export const getTransferStatus = async () => {
  try {
    const response = await api.get('/transfer/status');
    return response.data;
  } catch (error) {
    console.error('Error getting transfer status:', error);
    throw error;
  }
};

export default api;

