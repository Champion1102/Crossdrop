/**
 * WebRTC Service for CrossDrop Browser-to-Browser File Transfer
 * Handles peer connections, data channels, and file transfer via WebRTC
 */

import config from '../config';

// Configuration for WebRTC
// Include both STUN and free TURN servers for better connectivity
const ICE_SERVERS = [
  // Google STUN servers (fast, reliable)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // OpenRelay free TURN servers (for NAT traversal when STUN fails)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Chunk size for file transfer (16KB for WebRTC DataChannel)
const CHUNK_SIZE = 16384;

// Buffer threshold before pausing (256KB)
const BUFFER_THRESHOLD = 262144;

// Reconnection configuration
const RECONNECT_CONFIG = {
  maxAttempts: 5,
  baseDelay: 1000,        // 1 second initial delay
  maxDelay: 30000,        // 30 seconds max delay
  backoffMultiplier: 2,   // Exponential backoff multiplier
};

// Ping/Pong configuration
const PING_INTERVAL = 20000;      // Send ping every 20 seconds
const PONG_TIMEOUT = 10000;       // Consider connection dead if no pong in 10s
const CONNECTION_TIMEOUT = 15000; // Initial connection timeout

class WebRTCService {
  constructor() {
    this.ws = null;
    this.roomId = null;
    this.peerId = null;
    this.deviceName = '';
    this.peerConnections = new Map(); // Map<peerId, RTCPeerConnection>
    this.dataChannels = new Map(); // Map<peerId, RTCDataChannel>
    this.pendingIceCandidates = new Map(); // Map<peerId, ICECandidate[]>

    // Event handlers (to be set by consumers)
    this.onPeerJoined = null;
    this.onPeerLeft = null;
    this.onPeerConnectionReady = null; // Called when data channel opens/closes
    this.onConnected = null;
    this.onDisconnected = null;
    this.onReconnecting = null;     // Called during reconnection attempts
    this.onReconnected = null;      // Called after successful reconnection
    this.onConnectionStateChange = null; // Called on WS state changes
    this.onError = null;
    this.onFileRequest = null;
    this.onFileAccepted = null;
    this.onFileRejected = null;
    this.onFileProgress = null;
    this.onFileComplete = null;
    this.onFileError = null;

    // File transfer state
    this.incomingFiles = new Map(); // Map<peerId, { fileInfo, chunks, receivedSize }>
    this.outgoingFiles = new Map(); // Map<peerId, { file, sentSize }>

    // Reconnection state
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.reconnectTimer = null;
    this.shouldReconnect = true;

    // Connection health monitoring
    this.pingInterval = null;
    this.pongTimeout = null;
    this.lastPongTime = null;
    this.connectionHealthy = false;

    // Network change listener
    this._boundHandleOnline = this._handleOnline.bind(this);
    this._boundHandleOffline = this._handleOffline.bind(this);
    this._boundHandleVisibilityChange = this._handleVisibilityChange.bind(this);

    // Setup network listeners
    this._setupNetworkListeners();
  }

  /**
   * Setup network change event listeners
   */
  _setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._boundHandleOnline);
      window.addEventListener('offline', this._boundHandleOffline);
      document.addEventListener('visibilitychange', this._boundHandleVisibilityChange);
    }
  }

  /**
   * Remove network change event listeners
   */
  _removeNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._boundHandleOnline);
      window.removeEventListener('offline', this._boundHandleOffline);
      document.removeEventListener('visibilitychange', this._boundHandleVisibilityChange);
    }
  }

  /**
   * Handle browser coming back online
   */
  _handleOnline() {
    console.log('Network: Back online');
    if (this.roomId && !this.isConnected()) {
      console.log('Attempting reconnection after coming online');
      this._attemptReconnect();
    }
  }

  /**
   * Handle browser going offline
   */
  _handleOffline() {
    console.log('Network: Went offline');
    this.connectionHealthy = false;
    this.onConnectionStateChange?.('offline');
  }

  /**
   * Handle page visibility change (tab switching, minimizing)
   */
  _handleVisibilityChange() {
    if (document.visibilityState === 'visible' && this.roomId) {
      console.log('Page visible - checking connection health');
      this._checkConnectionHealth();
    }
  }

  /**
   * Check if WebSocket is currently connected
   */
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN && this.connectionHealthy;
  }

  /**
   * Get current connection state
   */
  getConnectionState() {
    if (!this.ws) return 'disconnected';
    if (this.isReconnecting) return 'reconnecting';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return this.connectionHealthy ? 'connected' : 'unstable';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }

  /**
   * Get signaling server URLs from config
   */
  getSignalingUrls() {
    // Default to localhost for development, can be overridden by config
    const baseUrl = config.SIGNALING_URL || 'http://localhost:3001';
    const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    return { httpUrl: baseUrl, wsUrl };
  }

  /**
   * Check connection health by sending a ping
   */
  _checkConnectionHealth() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._sendPing();
    } else if (this.roomId && this.shouldReconnect) {
      this._attemptReconnect();
    }
  }

  /**
   * Send a ping and setup pong timeout
   */
  _sendPing() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    // Clear any existing pong timeout
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
    }

    // Send ping
    this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));

    // Setup pong timeout - if no response, connection may be dead
    this.pongTimeout = setTimeout(() => {
      console.warn('Pong timeout - connection may be dead');
      this.connectionHealthy = false;
      this.onConnectionStateChange?.('unstable');

      // Try to reconnect
      if (this.shouldReconnect && this.roomId) {
        this._closeWebSocket();
        this._attemptReconnect();
      }
    }, PONG_TIMEOUT);
  }

  /**
   * Handle pong response
   */
  _handlePong(timestamp) {
    // Clear pong timeout
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }

    this.lastPongTime = Date.now();
    const latency = timestamp ? Date.now() - timestamp : 0;

    if (!this.connectionHealthy) {
      this.connectionHealthy = true;
      this.onConnectionStateChange?.('connected');
    }

    // Log high latency
    if (latency > 2000) {
      console.warn(`High signaling latency: ${latency}ms`);
    }
  }

  /**
   * Start the ping interval for keep-alive
   */
  _startPingInterval() {
    this._stopPingInterval();

    this.pingInterval = setInterval(() => {
      this._sendPing();
    }, PING_INTERVAL);

    // Send first ping immediately
    setTimeout(() => this._sendPing(), 1000);
  }

  /**
   * Stop the ping interval
   */
  _stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  /**
   * Close WebSocket connection gracefully
   */
  _closeWebSocket() {
    this._stopPingInterval();

    if (this.ws) {
      // Remove handlers to prevent callbacks during close
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close(1000, 'Client closing');
        } catch (e) {
          console.warn('Error closing WebSocket:', e);
        }
      }
      this.ws = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  _attemptReconnect() {
    if (this.isReconnecting || !this.shouldReconnect || !this.roomId) {
      return;
    }

    if (this.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
      console.error('Max reconnection attempts reached');
      this.isReconnecting = false;
      this.onError?.('Connection lost. Please rejoin the room.');
      this.onDisconnected?.();
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(
      RECONNECT_CONFIG.baseDelay * Math.pow(RECONNECT_CONFIG.backoffMultiplier, this.reconnectAttempts - 1),
      RECONNECT_CONFIG.maxDelay
    );

    console.log(`Reconnection attempt ${this.reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} in ${delay}ms`);
    this.onReconnecting?.({ attempt: this.reconnectAttempts, maxAttempts: RECONNECT_CONFIG.maxAttempts, delay });
    this.onConnectionStateChange?.('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      try {
        // Close existing connection cleanly
        this._closeWebSocket();

        // Reconnect with existing room info
        await this._connectWebSocket(this.roomId, this.peerId, this.deviceName);

        // Success - reset counters
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.connectionHealthy = true;

        console.log('Reconnected successfully');
        this.onReconnected?.();
        this.onConnectionStateChange?.('connected');

      } catch (error) {
        console.error('Reconnection failed:', error);
        this.isReconnecting = false;

        // Try again
        this._attemptReconnect();
      }
    }, delay);
  }

  /**
   * Connect WebSocket only (for reconnection)
   */
  async _connectWebSocket(roomId, peerId, deviceName) {
    const { wsUrl } = this.getSignalingUrls();

    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);

        // Re-join the room via WebSocket
        this.ws.send(JSON.stringify({
          type: 'join',
          roomId,
          peerId,
          deviceName
        }));
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'joined') {
          this._startPingInterval();
          this.connectionHealthy = true;
          resolve(message);
        }

        // Continue handling other messages
        this.handleSignalingMessage(message, null);
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket closed:', event.code, event.reason);
        this.connectionHealthy = false;
        this._stopPingInterval();

        // Don't trigger disconnect callback during reconnection
        if (!this.isReconnecting && this.shouldReconnect && this.roomId) {
          this._attemptReconnect();
        } else if (!this.isReconnecting) {
          this.onDisconnected?.();
        }
      };
    });
  }

  /**
   * Connect to a room via the signaling server
   */
  async connect(roomId, deviceName) {
    const { httpUrl } = this.getSignalingUrls();
    this.deviceName = deviceName || 'Browser Device';
    this.roomId = roomId;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    try {
      // Step 1: Join room via HTTP to get peerId
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

      const response = await fetch(`${httpUrl}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, deviceName: this.deviceName }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to join room: ${response.status}`);
      }

      const data = await response.json();
      this.peerId = data.peerId;

      // Step 2: Connect via WebSocket for real-time signaling
      return new Promise((resolve, reject) => {
        const { wsUrl } = this.getSignalingUrls();
        const connectionTimeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, CONNECTION_TIMEOUT);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          // Join the room via WebSocket
          this.ws.send(JSON.stringify({
            type: 'join',
            roomId: this.roomId,
            peerId: this.peerId,
            deviceName: this.deviceName
          }));
        };

        this.ws.onmessage = (event) => {
          const message = JSON.parse(event.data);

          if (message.type === 'joined') {
            clearTimeout(connectionTimeout);
            this._startPingInterval();
            this.connectionHealthy = true;
          }

          this.handleSignalingMessage(message, resolve);
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('WebSocket error:', error);
          this.onError?.('WebSocket connection error');
          reject(error);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.connectionHealthy = false;
          this._stopPingInterval();

          // Attempt reconnection if not intentional disconnect
          if (this.shouldReconnect && this.roomId && !this.isReconnecting) {
            this._attemptReconnect();
          } else if (!this.isReconnecting) {
            this.onDisconnected?.();
          }
        };
      });
    } catch (error) {
      console.error('Failed to connect:', error);
      this.onError?.(error.message);
      throw error;
    }
  }

  /**
   * Disconnect from the room
   */
  disconnect() {
    // Prevent auto-reconnection
    this.shouldReconnect = false;

    // Clear reconnect timer if pending
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Stop ping interval
    this._stopPingInterval();

    // Close all peer connections
    this.peerConnections.forEach((pc) => {
      pc.close();
    });
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.pendingIceCandidates.clear();

    // Leave room and close WebSocket
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'leave' }));
      } catch (e) {
        // Ignore send errors during disconnect
      }
    }
    this._closeWebSocket();

    // Reset state
    this.roomId = null;
    this.peerId = null;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.connectionHealthy = false;

    // Clear file transfer state
    this.incomingFiles.clear();
    this.outgoingFiles.clear();
  }

  /**
   * Cleanup resources when service is destroyed
   */
  destroy() {
    this.disconnect();
    this._removeNetworkListeners();
  }

  /**
   * Handle incoming signaling messages
   */
  handleSignalingMessage(message, resolveConnect) {
    switch (message.type) {
      case 'joined':
        console.log('Joined room:', message.roomId, 'as', message.peerId);
        console.log('Existing peers:', message.peers);

        // Initiate connections to existing peers
        message.peers.forEach(peer => {
          this.createPeerConnection(peer.peerId, peer.deviceName, true);
        });

        this.onConnected?.({
          roomId: message.roomId,
          peerId: message.peerId,
          peers: message.peers
        });
        resolveConnect?.(message);
        break;

      case 'peer-joined':
        console.log('Peer joined:', message.peerId, message.deviceName);
        // Wait for offer from the new peer (they will initiate)
        this.onPeerJoined?.({
          peerId: message.peerId,
          deviceName: message.deviceName,
          peers: message.peers
        });
        break;

      case 'peer-left':
        console.log('Peer left:', message.peerId);
        this.cleanupPeer(message.peerId);
        this.onPeerLeft?.({
          peerId: message.peerId,
          peers: message.peers
        });
        break;

      case 'offer':
        this.handleOffer(message);
        break;

      case 'answer':
        this.handleAnswer(message);
        break;

      case 'ice-candidate':
        this.handleIceCandidate(message);
        break;

      case 'file-request':
        this.onFileRequest?.({
          fromPeerId: message.fromPeerId,
          fromDeviceName: message.fromDeviceName,
          fileInfo: message.fileInfo
        });
        break;

      case 'file-accept':
        this.onFileAccepted?.(message);
        break;

      case 'file-reject':
        this.onFileRejected?.(message);
        break;

      case 'error':
        console.error('Signaling error:', message.message);
        this.onError?.(message.message);
        break;

      case 'pong':
        // Handle pong for connection health monitoring
        this._handlePong(message.timestamp);
        break;

      case 'peer-reconnected':
        // Peer has reconnected - re-establish WebRTC connection
        console.log('Peer reconnected:', message.peerId, message.deviceName);
        // Create a new peer connection to the reconnected peer
        this.createPeerConnection(message.peerId, message.deviceName, true);
        this.onPeerJoined?.({
          peerId: message.peerId,
          deviceName: message.deviceName,
          peers: message.peers,
          isReconnection: true
        });
        break;

      case 'server-shutdown':
        // Server is shutting down - will need to reconnect
        console.warn('Server is shutting down:', message.message);
        this.onError?.('Server is restarting. Please wait...');
        // The WebSocket close handler will trigger reconnection
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  /**
   * Create a new RTCPeerConnection for a peer
   */
  createPeerConnection(peerId, peerDeviceName, isInitiator) {
    console.log(`Creating peer connection to ${peerId} (initiator: ${isInitiator})`);

    // Clean up any existing connection first
    if (this.peerConnections.has(peerId)) {
      console.log(`Cleaning up existing connection to ${peerId} before creating new one`);
      this.cleanupPeer(peerId);
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10, // Pre-gather ICE candidates for faster connection
      iceTransportPolicy: 'all', // Use all available ICE candidates
      bundlePolicy: 'max-bundle', // Bundle all media into one connection
      rtcpMuxPolicy: 'require', // Require RTCP multiplexing
    });

    this.peerConnections.set(peerId, pc);
    this.pendingIceCandidates.set(peerId, []);

    // Track connection attempt for retry logic
    let connectionAttempts = 0;
    const maxConnectionAttempts = 3;

    // Handle ICE candidates - send each candidate as soon as it's gathered (trickle ICE)
    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws?.readyState === WebSocket.OPEN) {
        console.log(`ICE candidate gathered for ${peerId}:`, event.candidate.type, event.candidate.protocol);
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          targetPeerId: peerId,
          candidate: event.candidate,
          roomId: this.roomId,
          fromPeerId: this.peerId
        }));
      } else if (!event.candidate) {
        console.log(`ICE candidate gathering completed for ${peerId}`);
      }
    };

    // Monitor ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering state with ${peerId}:`, pc.iceGatheringState);
    };

    // Handle ICE connection state changes (more granular than connection state)
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerId}:`, pc.iceConnectionState);

      switch (pc.iceConnectionState) {
        case 'checking':
          // Connection attempt in progress
          break;
        case 'connected':
        case 'completed':
          // Connection successful
          connectionAttempts = 0;
          break;
        case 'disconnected':
          // Temporary disconnection - may recover
          console.log(`Temporary disconnection with ${peerId}, may recover...`);
          break;
        case 'failed':
          // Connection failed - attempt recovery
          console.error(`ICE connection failed with ${peerId}`);
          if (connectionAttempts < maxConnectionAttempts && isInitiator) {
            connectionAttempts++;
            console.log(`Attempting ICE restart (attempt ${connectionAttempts}/${maxConnectionAttempts})`);
            this._restartIce(peerId);
          } else {
            this.cleanupPeer(peerId);
          }
          break;
        case 'closed':
          // Connection closed
          break;
      }
    };

    // Handle overall connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, pc.connectionState);

      switch (pc.connectionState) {
        case 'connected':
          // Connection fully established
          console.log(`Peer connection established with ${peerId}`);
          break;
        case 'disconnected':
          // May recover on its own
          console.log(`Peer ${peerId} disconnected, waiting for recovery...`);
          // Set a timeout to cleanup if it doesn't recover
          setTimeout(() => {
            if (pc.connectionState === 'disconnected') {
              console.log(`Peer ${peerId} did not recover, cleaning up`);
              this.cleanupPeer(peerId);
            }
          }, 10000); // Wait 10 seconds for recovery
          break;
        case 'failed':
          console.error(`Peer connection failed with ${peerId}`);
          this.cleanupPeer(peerId);
          break;
        case 'closed':
          this.cleanupPeer(peerId);
          break;
      }
    };

    // Handle signaling state changes for debugging
    pc.onsignalingstatechange = () => {
      console.log(`Signaling state with ${peerId}:`, pc.signalingState);
    };

    // Handle data channel events
    pc.ondatachannel = (event) => {
      console.log('Received data channel from', peerId);
      this.setupDataChannel(event.channel, peerId);
    };

    // If we're the initiator, create data channel and offer
    if (isInitiator) {
      const dc = pc.createDataChannel('fileTransfer', {
        ordered: true,
        maxRetransmits: 30 // Retry failed transmissions up to 30 times
      });
      this.setupDataChannel(dc, peerId);

      // Create and send offer
      this._createAndSendOffer(pc, peerId);
    }

    return pc;
  }

  /**
   * Create and send an SDP offer
   */
  async _createAndSendOffer(pc, peerId) {
    try {
      console.log(`Creating offer for ${peerId}...`);
      const startTime = Date.now();

      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });

      console.log(`Offer created in ${Date.now() - startTime}ms, setting local description...`);
      await pc.setLocalDescription(offer);

      console.log(`Local description set in ${Date.now() - startTime}ms, sending offer...`);

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'offer',
          targetPeerId: peerId,
          sdp: pc.localDescription,
          roomId: this.roomId,
          fromPeerId: this.peerId,
          fromDeviceName: this.deviceName
        }));
        console.log(`Offer sent to ${peerId} in ${Date.now() - startTime}ms`);
      } else {
        console.error('WebSocket not open, cannot send offer');
      }
    } catch (error) {
      console.error('Error creating offer:', error);
      this.onError?.('Failed to create connection offer');
    }
  }

  /**
   * Restart ICE connection for a peer
   */
  async _restartIce(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (!pc || pc.connectionState === 'closed') {
      return;
    }

    try {
      // Create a new offer with ICE restart
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'offer',
          targetPeerId: peerId,
          sdp: pc.localDescription,
          roomId: this.roomId,
          fromPeerId: this.peerId,
          fromDeviceName: this.deviceName,
          iceRestart: true
        }));
        console.log(`ICE restart offer sent to ${peerId}`);
      }
    } catch (error) {
      console.error('Error restarting ICE:', error);
    }
  }

  /**
   * Setup data channel event handlers
   */
  setupDataChannel(dc, peerId) {
    dc.binaryType = 'arraybuffer';
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      console.log('Data channel opened with', peerId);
      // Notify that peer is now ready for file transfer
      this.onPeerConnectionReady?.({ peerId, ready: true });
    };

    dc.onclose = () => {
      console.log('Data channel closed with', peerId);
      this.dataChannels.delete(peerId);
      // Notify that peer is no longer ready
      this.onPeerConnectionReady?.({ peerId, ready: false });
    };

    dc.onerror = (error) => {
      console.error('Data channel error with', peerId, error);
    };

    dc.onmessage = (event) => {
      this.handleDataChannelMessage(event, peerId);
    };
  }

  /**
   * Handle incoming WebRTC offer
   */
  async handleOffer(message) {
    const { fromPeerId, fromDeviceName, sdp } = message;
    console.log('Received offer from', fromPeerId);

    let pc = this.peerConnections.get(fromPeerId);
    if (!pc) {
      pc = this.createPeerConnection(fromPeerId, fromDeviceName, false);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Process any pending ICE candidates
      const pendingCandidates = this.pendingIceCandidates.get(fromPeerId) || [];
      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingIceCandidates.set(fromPeerId, []);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.ws.send(JSON.stringify({
        type: 'answer',
        targetPeerId: fromPeerId,
        sdp: pc.localDescription,
        roomId: this.roomId,
        fromPeerId: this.peerId,
        fromDeviceName: this.deviceName
      }));
    } catch (error) {
      console.error('Error handling offer:', error);
      this.onError?.('Failed to handle connection offer');
    }
  }

  /**
   * Handle incoming WebRTC answer
   */
  async handleAnswer(message) {
    const { fromPeerId, sdp } = message;
    console.log('Received answer from', fromPeerId);

    const pc = this.peerConnections.get(fromPeerId);
    if (!pc) {
      console.error('No peer connection for', fromPeerId);
      return;
    }

    try {
      console.log(`Setting remote description for ${fromPeerId}...`);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`Remote description set for ${fromPeerId}, current state:`, pc.connectionState);

      // Process any pending ICE candidates
      const pendingCandidates = this.pendingIceCandidates.get(fromPeerId) || [];
      console.log(`Processing ${pendingCandidates.length} pending ICE candidates for ${fromPeerId}`);
      for (const candidate of pendingCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn(`Failed to add pending ICE candidate for ${fromPeerId}:`, e.message);
        }
      }
      this.pendingIceCandidates.set(fromPeerId, []);
    } catch (error) {
      console.error('Error handling answer:', error);
      this.onError?.('Failed to establish connection');
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(message) {
    const { fromPeerId, candidate } = message;
    const pc = this.peerConnections.get(fromPeerId);

    if (!pc) {
      // Store candidate for later if peer connection doesn't exist yet
      console.log(`Queuing ICE candidate for ${fromPeerId} (no peer connection yet)`);
      const pending = this.pendingIceCandidates.get(fromPeerId) || [];
      pending.push(candidate);
      this.pendingIceCandidates.set(fromPeerId, pending);
      return;
    }

    if (!pc.remoteDescription) {
      // Store candidate for later if remote description not set
      console.log(`Queuing ICE candidate for ${fromPeerId} (no remote description yet)`);
      const pending = this.pendingIceCandidates.get(fromPeerId) || [];
      pending.push(candidate);
      this.pendingIceCandidates.set(fromPeerId, pending);
      return;
    }

    try {
      console.log(`Adding ICE candidate for ${fromPeerId}:`, candidate.type || 'unknown', candidate.protocol || '');
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      // Ignore errors for candidates that arrive after connection is established
      if (!error.message?.includes('location information')) {
        console.warn('Error adding ICE candidate:', error.message);
      }
    }
  }

  /**
   * Clean up peer connection resources
   */
  cleanupPeer(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.dataChannels.delete(peerId);
    this.pendingIceCandidates.delete(peerId);
    this.incomingFiles.delete(peerId);
    this.outgoingFiles.delete(peerId);
  }

  /**
   * Get list of connected peers
   */
  getConnectedPeers() {
    const connected = [];
    this.dataChannels.forEach((dc, peerId) => {
      if (dc.readyState === 'open') {
        connected.push(peerId);
      }
    });
    return connected;
  }

  /**
   * Check if connected to a specific peer
   */
  isConnectedTo(peerId) {
    const dc = this.dataChannels.get(peerId);
    return dc?.readyState === 'open';
  }

  /**
   * Get detailed connection status for a peer
   */
  getPeerConnectionStatus(peerId) {
    const pc = this.peerConnections.get(peerId);
    const dc = this.dataChannels.get(peerId);

    if (!pc) {
      return { status: 'no-connection', details: 'Peer connection not created' };
    }

    return {
      status: dc?.readyState === 'open' ? 'connected' : 'connecting',
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState,
      dataChannelState: dc?.readyState || 'none',
    };
  }

  /**
   * Request to send a file to a peer
   */
  requestFileSend(targetPeerId, file) {
    const fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream'
    };

    this.ws.send(JSON.stringify({
      type: 'file-request',
      targetPeerId,
      roomId: this.roomId,
      fromPeerId: this.peerId,
      fromDeviceName: this.deviceName,
      fileInfo
    }));

    // Store the file for when peer accepts
    this.outgoingFiles.set(targetPeerId, { file, sentSize: 0, fileInfo });
  }

  /**
   * Accept a file transfer request and start receiving
   */
  acceptFileTransfer(fromPeerId, fileInfo) {
    // Initialize incoming file state
    this.incomingFiles.set(fromPeerId, {
      fileInfo,
      chunks: [],
      receivedSize: 0
    });

    this.ws.send(JSON.stringify({
      type: 'file-accept',
      targetPeerId: fromPeerId,
      roomId: this.roomId,
      fromPeerId: this.peerId,
      fileInfo
    }));
  }

  /**
   * Reject a file transfer request
   */
  rejectFileTransfer(fromPeerId, reason = 'User rejected') {
    this.ws.send(JSON.stringify({
      type: 'file-reject',
      targetPeerId: fromPeerId,
      roomId: this.roomId,
      fromPeerId: this.peerId,
      reason
    }));
  }

  /**
   * Start sending a file after peer accepts
   */
  async startFileSend(targetPeerId) {
    const outgoing = this.outgoingFiles.get(targetPeerId);
    if (!outgoing) {
      console.error('No pending file for peer:', targetPeerId);
      return;
    }

    const dc = this.dataChannels.get(targetPeerId);
    if (!dc || dc.readyState !== 'open') {
      console.error('Data channel not ready for peer:', targetPeerId);
      this.onFileError?.({ targetPeerId, error: 'Data channel not ready' });
      return;
    }

    const { file, fileInfo } = outgoing;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Send file metadata first
    dc.send(JSON.stringify({
      type: 'file-start',
      fileInfo,
      totalChunks
    }));

    // Read and send file in chunks
    let offset = 0;
    let chunkIndex = 0;

    const sendNextChunk = async () => {
      if (offset >= file.size) {
        // Send end marker
        dc.send(JSON.stringify({ type: 'file-end' }));
        this.onFileComplete?.({
          targetPeerId,
          fileInfo,
          direction: 'send'
        });
        this.outgoingFiles.delete(targetPeerId);
        return;
      }

      // Wait if buffer is full
      while (dc.bufferedAmount > BUFFER_THRESHOLD) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const arrayBuffer = await chunk.arrayBuffer();

      dc.send(arrayBuffer);

      offset += chunk.size;
      chunkIndex++;

      // Report progress
      this.onFileProgress?.({
        targetPeerId,
        fileInfo,
        direction: 'send',
        bytesSent: offset,
        totalBytes: file.size,
        progress: (offset / file.size) * 100
      });

      // Continue sending
      requestAnimationFrame(sendNextChunk);
    };

    sendNextChunk();
  }

  /**
   * Handle data channel messages (file chunks)
   */
  handleDataChannelMessage(event, peerId) {
    if (typeof event.data === 'string') {
      // Control message
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'file-start':
          console.log('Starting file receive:', message.fileInfo.name);
          this.incomingFiles.set(peerId, {
            fileInfo: message.fileInfo,
            chunks: [],
            receivedSize: 0,
            totalChunks: message.totalChunks
          });
          break;

        case 'file-end':
          this.completeFileReceive(peerId);
          break;
      }
    } else {
      // Binary data (file chunk)
      const incoming = this.incomingFiles.get(peerId);
      if (!incoming) {
        console.error('Received chunk but no incoming file state');
        return;
      }

      incoming.chunks.push(event.data);
      incoming.receivedSize += event.data.byteLength;

      // Report progress
      this.onFileProgress?.({
        fromPeerId: peerId,
        fileInfo: incoming.fileInfo,
        direction: 'receive',
        bytesReceived: incoming.receivedSize,
        totalBytes: incoming.fileInfo.size,
        progress: (incoming.receivedSize / incoming.fileInfo.size) * 100
      });
    }
  }

  /**
   * Complete file receive and trigger download
   */
  completeFileReceive(peerId) {
    const incoming = this.incomingFiles.get(peerId);
    if (!incoming) return;

    const { fileInfo, chunks } = incoming;

    // Combine chunks into a single blob
    const blob = new Blob(chunks, { type: fileInfo.type });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileInfo.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.onFileComplete?.({
      fromPeerId: peerId,
      fileInfo,
      direction: 'receive',
      blob
    });

    this.incomingFiles.delete(peerId);
  }

  /**
   * Cancel an ongoing file transfer
   */
  cancelFileTransfer(peerId) {
    this.incomingFiles.delete(peerId);
    this.outgoingFiles.delete(peerId);
  }
}

// Export singleton instance
const webrtcService = new WebRTCService();
export default webrtcService;

// Also export the class for creating multiple instances if needed
export { WebRTCService };
