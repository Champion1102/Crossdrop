/**
 * WebRTC Service for Crossdrop
 * Clean, modular implementation for browser-to-browser file transfer
 */

import config from '../config';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ICE_SERVERS = [
  // Google STUN servers (free, fast, works 75-80% of time)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Metered TURN servers (free tier - get your own at metered.ca for production)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// File transfer settings
const CHUNK_SIZE = 16384;        // 16KB - optimal for WebRTC DataChannel
const BUFFER_THRESHOLD = 65536;  // 64KB - pause if buffer exceeds this

// Connection settings
const PING_INTERVAL = 25000;     // Match server's 30s with some margin
const PONG_TIMEOUT = 10000;      // Consider dead after 10s without pong
const CONNECTION_TIMEOUT = 15000;

// Reconnection settings
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

// ============================================================================
// WEBRTC SERVICE CLASS
// ============================================================================

class WebRTCService {
  constructor() {
    // Connection state
    this.ws = null;
    this.peerId = null;
    this.peerName = null;
    this.roomId = null;

    // Peer connections
    this.peerConnections = new Map();  // peerId -> RTCPeerConnection
    this.dataChannels = new Map();     // peerId -> RTCDataChannel
    this.pendingCandidates = new Map(); // peerId -> ICECandidate[]

    // File transfer state
    this.incomingFiles = new Map();    // peerId -> { fileInfo, chunks, receivedSize }
    this.outgoingFiles = new Map();    // peerId -> { file, fileInfo }

    // Health monitoring
    this.pingInterval = null;
    this.pongTimeout = null;
    this.isHealthy = false;

    // Reconnection
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.shouldReconnect = false;

    // Event callbacks (set by consumers)
    this.onConnected = null;
    this.onDisconnected = null;
    this.onReconnecting = null;
    this.onReconnected = null;
    this.onConnectionStateChange = null;
    this.onError = null;
    this.onPeerJoined = null;
    this.onPeerLeft = null;
    this.onPeerConnectionReady = null;
    this.onFileRequest = null;
    this.onFileAccepted = null;
    this.onFileRejected = null;
    this.onFileProgress = null;
    this.onFileComplete = null;
    this.onFileError = null;

    // Network listeners
    this._setupNetworkListeners();
  }

  // ==========================================================================
  // CONNECTION MANAGEMENT
  // ==========================================================================

  /**
   * Get WebSocket URL from config
   */
  _getWsUrl(name) {
    const baseUrl = config.SIGNALING_URL || `http://${window.location.hostname}:3001`;
    const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    const encodedName = encodeURIComponent(name || 'Browser');
    return `${wsUrl}/ws?name=${encodedName}`;
  }

  /**
   * Connect to a room
   */
  async connect(roomId, name = 'Browser Device') {
    this.roomId = roomId;
    this.peerName = name;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;

    return this._connectWebSocket();
  }

  /**
   * Internal WebSocket connection
   */
  _connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = this._getWsUrl(this.peerName);
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this._handleMessage(message, resolve, clearTimeout.bind(null, timeout));
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', error);
        this.onError?.('Connection failed');
        reject(error);
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        console.log('WebSocket closed:', event.code, event.reason);
        this._handleDisconnect();
      };
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  _handleMessage(message, resolveConnect, clearConnectTimeout) {
    switch (message.type) {
      case 'welcome':
        // Got our peer ID, now join the room
        this.peerId = message.peerId;
        this.peerName = message.name;
        this._send({ type: 'join', roomId: this.roomId, name: this.peerName });
        break;

      case 'joined':
        // Successfully joined room
        clearConnectTimeout?.();
        this._startHeartbeat();
        this.isHealthy = true;

        // Convert peer format and initiate connections to existing peers
        const peers = (message.peers || []).map(p => ({
          peerId: p.id,
          deviceName: p.name,
        }));

        peers.forEach(peer => {
          this._createPeerConnection(peer.peerId, true);
        });

        this.onConnected?.({
          roomId: message.roomId,
          peerId: this.peerId,
          peers,
        });
        resolveConnect?.({ roomId: message.roomId, peerId: this.peerId, peers });
        break;

      case 'peer-joined':
        // New peer joined - wait for them to initiate
        const newPeer = {
          peerId: message.peer.id,
          deviceName: message.peer.name,
        };
        this.onPeerJoined?.(newPeer);
        break;

      case 'peer-left':
        this._cleanupPeer(message.peerId);
        this.onPeerLeft?.({ peerId: message.peerId });
        break;

      case 'offer':
        this._handleOffer(message);
        break;

      case 'answer':
        this._handleAnswer(message);
        break;

      case 'ice-candidate':
        this._handleIceCandidate(message);
        break;

      case 'file-request':
        this.onFileRequest?.({
          fromPeerId: message.fromPeerId,
          fromDeviceName: message.fromPeerName,
          fileInfo: message.fileInfo,
        });
        break;

      case 'file-accept':
        this.onFileAccepted?.({ fromPeerId: message.fromPeerId });
        this._startFileSend(message.fromPeerId);
        break;

      case 'file-reject':
        this.onFileRejected?.({
          fromPeerId: message.fromPeerId,
          reason: message.reason,
        });
        break;

      case 'ping':
        this._send({ type: 'pong' });
        break;

      case 'pong':
        this._handlePong();
        break;

      case 'server-shutdown':
        console.warn('Server shutting down');
        this.onError?.('Server restarting, please wait...');
        break;

      case 'error':
        console.error('Server error:', message.error);
        this.onError?.(message.error);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  /**
   * Send message via WebSocket
   */
  _send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Disconnect from room
   */
  disconnect() {
    this.shouldReconnect = false;
    this._stopHeartbeat();
    this._clearReconnectTimer();

    // Close all peer connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.pendingCandidates.clear();
    this.incomingFiles.clear();
    this.outgoingFiles.clear();

    // Send leave and close WebSocket
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send({ type: 'leave' });
      this.ws.close(1000, 'User disconnect');
    }
    this.ws = null;

    this.roomId = null;
    this.peerId = null;
    this.isHealthy = false;
  }

  /**
   * Handle WebSocket disconnect
   */
  _handleDisconnect() {
    this._stopHeartbeat();
    this.isHealthy = false;

    if (this.shouldReconnect && this.roomId) {
      this._attemptReconnect();
    } else {
      this.onDisconnected?.();
    }
  }

  // ==========================================================================
  // HEARTBEAT / HEALTH
  // ==========================================================================

  _startHeartbeat() {
    this._stopHeartbeat();
    this.pingInterval = setInterval(() => this._sendPing(), PING_INTERVAL);
  }

  _stopHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);
    this.pingInterval = null;
    this.pongTimeout = null;
  }

  _sendPing() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    this._send({ type: 'ping' });

    this.pongTimeout = setTimeout(() => {
      console.warn('Pong timeout - connection unhealthy');
      this.isHealthy = false;
      this.onConnectionStateChange?.('unstable');

      if (this.shouldReconnect) {
        this.ws?.close();
      }
    }, PONG_TIMEOUT);
  }

  _handlePong() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    if (!this.isHealthy) {
      this.isHealthy = true;
      this.onConnectionStateChange?.('connected');
    }
  }

  // ==========================================================================
  // RECONNECTION
  // ==========================================================================

  _attemptReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      this.onError?.('Connection lost. Please rejoin.');
      this.onDisconnected?.();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY
    );

    this.onReconnecting?.({
      attempt: this.reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
      delay,
    });
    this.onConnectionStateChange?.('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this._connectWebSocket();
        this.reconnectAttempts = 0;
        this.onReconnected?.();
        this.onConnectionStateChange?.('connected');
      } catch (error) {
        console.error('Reconnection failed:', error);
        this._attemptReconnect();
      }
    }, delay);
  }

  _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ==========================================================================
  // NETWORK LISTENERS
  // ==========================================================================

  _setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      if (this.roomId && !this.isConnected()) {
        this._attemptReconnect();
      }
    });

    window.addEventListener('offline', () => {
      this.isHealthy = false;
      this.onConnectionStateChange?.('offline');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.roomId) {
        this._sendPing();
      }
    });
  }

  // ==========================================================================
  // PEER CONNECTION MANAGEMENT
  // ==========================================================================

  /**
   * Create RTCPeerConnection for a peer
   */
  _createPeerConnection(peerId, isInitiator) {
    // Clean up existing connection
    if (this.peerConnections.has(peerId)) {
      this._cleanupPeer(peerId);
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });

    this.peerConnections.set(peerId, pc);
    this.pendingCandidates.set(peerId, []);

    // ICE candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._send({
          type: 'ice-candidate',
          targetPeerId: peerId,
          candidate: event.candidate,
        });
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      console.log(`Connection state [${peerId}]:`, pc.connectionState);

      if (pc.connectionState === 'failed') {
        console.error(`Connection failed with ${peerId}`);
        this._cleanupPeer(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state [${peerId}]:`, pc.iceConnectionState);
    };

    // Data channel handler (for non-initiator)
    pc.ondatachannel = (event) => {
      this._setupDataChannel(event.channel, peerId);
    };

    // If initiator, create data channel and send offer
    if (isInitiator) {
      const dc = pc.createDataChannel('fileTransfer', {
        ordered: true,
        maxRetransmits: 30,
      });
      this._setupDataChannel(dc, peerId);
      this._createAndSendOffer(pc, peerId);
    }

    return pc;
  }

  /**
   * Setup data channel event handlers
   */
  _setupDataChannel(dc, peerId) {
    dc.binaryType = 'arraybuffer';
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      console.log(`Data channel open [${peerId}]`);
      this.onPeerConnectionReady?.({ peerId, ready: true });
    };

    dc.onclose = () => {
      console.log(`Data channel closed [${peerId}]`);
      this.dataChannels.delete(peerId);
      this.onPeerConnectionReady?.({ peerId, ready: false });
    };

    dc.onerror = (error) => {
      console.error(`Data channel error [${peerId}]:`, error);
    };

    dc.onmessage = (event) => {
      this._handleDataChannelMessage(event, peerId);
    };
  }

  /**
   * Create and send SDP offer
   */
  async _createAndSendOffer(pc, peerId) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this._send({
        type: 'offer',
        targetPeerId: peerId,
        sdp: pc.localDescription,
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      this.onError?.('Failed to create connection');
    }
  }

  /**
   * Handle incoming offer
   */
  async _handleOffer(message) {
    const { fromPeerId, fromPeerName, sdp } = message;

    let pc = this.peerConnections.get(fromPeerId);
    if (!pc) {
      pc = this._createPeerConnection(fromPeerId, false);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Process pending ICE candidates
      const pending = this.pendingCandidates.get(fromPeerId) || [];
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates.set(fromPeerId, []);

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this._send({
        type: 'answer',
        targetPeerId: fromPeerId,
        sdp: pc.localDescription,
      });

      // Signal ready for ICE candidates
      this._send({
        type: 'ready-for-candidates',
        targetPeerId: fromPeerId,
      });
    } catch (error) {
      console.error('Error handling offer:', error);
      this.onError?.('Failed to establish connection');
    }
  }

  /**
   * Handle incoming answer
   */
  async _handleAnswer(message) {
    const { fromPeerId, sdp } = message;
    const pc = this.peerConnections.get(fromPeerId);

    if (!pc) {
      console.error('No peer connection for answer:', fromPeerId);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Process pending ICE candidates
      const pending = this.pendingCandidates.get(fromPeerId) || [];
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          // Ignore - candidate may be for old session
        }
      }
      this.pendingCandidates.set(fromPeerId, []);

      // Signal ready for ICE candidates
      this._send({
        type: 'ready-for-candidates',
        targetPeerId: fromPeerId,
      });
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async _handleIceCandidate(message) {
    const { fromPeerId, candidate } = message;
    const pc = this.peerConnections.get(fromPeerId);

    if (!pc || !pc.remoteDescription) {
      // Queue candidate until remote description is set
      const pending = this.pendingCandidates.get(fromPeerId) || [];
      pending.push(candidate);
      this.pendingCandidates.set(fromPeerId, pending);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      // Ignore errors for candidates that arrive after connection
    }
  }

  /**
   * Clean up peer connection resources
   */
  _cleanupPeer(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.dataChannels.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.incomingFiles.delete(peerId);
    this.outgoingFiles.delete(peerId);
  }

  // ==========================================================================
  // FILE TRANSFER
  // ==========================================================================

  /**
   * Request to send a file
   */
  requestFileSend(targetPeerId, file) {
    const fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    };

    this.outgoingFiles.set(targetPeerId, { file, fileInfo });

    this._send({
      type: 'file-request',
      targetPeerId,
      fileInfo,
    });
  }

  /**
   * Accept incoming file
   */
  acceptFileTransfer(fromPeerId, fileInfo) {
    this.incomingFiles.set(fromPeerId, {
      fileInfo,
      chunks: [],
      receivedSize: 0,
    });

    this._send({
      type: 'file-accept',
      targetPeerId: fromPeerId,
    });
  }

  /**
   * Reject incoming file
   */
  rejectFileTransfer(fromPeerId, reason = 'Declined') {
    this._send({
      type: 'file-reject',
      targetPeerId: fromPeerId,
      reason,
    });
  }

  /**
   * Start sending file chunks
   */
  async _startFileSend(targetPeerId) {
    const outgoing = this.outgoingFiles.get(targetPeerId);
    if (!outgoing) return;

    const dc = this.dataChannels.get(targetPeerId);
    if (!dc || dc.readyState !== 'open') {
      this.onFileError?.({ targetPeerId, error: 'Data channel not ready' });
      return;
    }

    const { file, fileInfo } = outgoing;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Send file metadata
    dc.send(JSON.stringify({
      type: 'file-start',
      fileInfo,
      totalChunks,
    }));

    // Send file chunks
    let offset = 0;

    const sendNextChunk = async () => {
      if (offset >= file.size) {
        dc.send(JSON.stringify({ type: 'file-end' }));
        this.outgoingFiles.delete(targetPeerId);
        this.onFileComplete?.({
          targetPeerId,
          fileInfo,
          direction: 'send',
        });
        return;
      }

      // Wait if buffer is full (backpressure)
      while (dc.bufferedAmount > BUFFER_THRESHOLD) {
        await new Promise(r => setTimeout(r, 10));
      }

      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const arrayBuffer = await chunk.arrayBuffer();
      dc.send(arrayBuffer);

      offset += chunk.size;

      this.onFileProgress?.({
        targetPeerId,
        fileInfo,
        direction: 'send',
        bytesSent: offset,
        totalBytes: file.size,
        progress: (offset / file.size) * 100,
      });

      // Use requestAnimationFrame for smooth sending
      requestAnimationFrame(sendNextChunk);
    };

    sendNextChunk();
  }

  /**
   * Handle data channel messages
   */
  _handleDataChannelMessage(event, peerId) {
    if (typeof event.data === 'string') {
      const message = JSON.parse(event.data);

      if (message.type === 'file-start') {
        this.incomingFiles.set(peerId, {
          fileInfo: message.fileInfo,
          chunks: [],
          receivedSize: 0,
          totalChunks: message.totalChunks,
        });
      } else if (message.type === 'file-end') {
        this._completeFileReceive(peerId);
      }
    } else {
      // Binary chunk
      const incoming = this.incomingFiles.get(peerId);
      if (!incoming) return;

      incoming.chunks.push(event.data);
      incoming.receivedSize += event.data.byteLength;

      this.onFileProgress?.({
        fromPeerId: peerId,
        fileInfo: incoming.fileInfo,
        direction: 'receive',
        bytesReceived: incoming.receivedSize,
        totalBytes: incoming.fileInfo.size,
        progress: (incoming.receivedSize / incoming.fileInfo.size) * 100,
      });
    }
  }

  /**
   * Complete file receive and trigger download
   */
  _completeFileReceive(peerId) {
    const incoming = this.incomingFiles.get(peerId);
    if (!incoming) return;

    const { fileInfo, chunks } = incoming;
    const blob = new Blob(chunks, { type: fileInfo.type });

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileInfo.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.incomingFiles.delete(peerId);
    this.onFileComplete?.({
      fromPeerId: peerId,
      fileInfo,
      direction: 'receive',
      blob,
    });
  }

  // ==========================================================================
  // PUBLIC HELPERS
  // ==========================================================================

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN && this.isHealthy;
  }

  isConnectedTo(peerId) {
    const dc = this.dataChannels.get(peerId);
    return dc?.readyState === 'open';
  }

  getConnectionState() {
    if (!this.ws) return 'disconnected';
    if (this.reconnectTimer) return 'reconnecting';
    if (this.ws.readyState === WebSocket.OPEN) {
      return this.isHealthy ? 'connected' : 'unstable';
    }
    return 'disconnected';
  }

  getPeerConnectionStatus(peerId) {
    const pc = this.peerConnections.get(peerId);
    const dc = this.dataChannels.get(peerId);

    if (!pc) {
      return { status: 'no-connection' };
    }

    return {
      status: dc?.readyState === 'open' ? 'connected' : 'connecting',
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      dataChannelState: dc?.readyState || 'none',
    };
  }

  /**
   * Start file send (called after file-accept)
   * Public method for backwards compatibility
   */
  startFileSend(targetPeerId) {
    this._startFileSend(targetPeerId);
  }
}

// Export singleton
const webrtcService = new WebRTCService();
export default webrtcService;
export { WebRTCService };
