/**
 * WebRTC Service for CrossDrop Browser-to-Browser File Transfer
 * Handles peer connections, data channels, and file transfer via WebRTC
 */

import config from '../config';

// Configuration for WebRTC
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// Chunk size for file transfer (16KB for WebRTC DataChannel)
const CHUNK_SIZE = 16384;

// Buffer threshold before pausing (256KB)
const BUFFER_THRESHOLD = 262144;

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
    this.onConnected = null;
    this.onDisconnected = null;
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
   * Connect to a room via the signaling server
   */
  async connect(roomId, deviceName) {
    const { httpUrl, wsUrl } = this.getSignalingUrls();
    this.deviceName = deviceName || 'Browser Device';
    this.roomId = roomId;

    try {
      // Step 1: Join room via HTTP to get peerId
      const response = await fetch(`${httpUrl}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, deviceName: this.deviceName })
      });

      if (!response.ok) {
        throw new Error('Failed to join room');
      }

      const data = await response.json();
      this.peerId = data.peerId;

      // Step 2: Connect via WebSocket for real-time signaling
      return new Promise((resolve, reject) => {
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
          this.handleSignalingMessage(JSON.parse(event.data), resolve);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.onError?.('WebSocket connection error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.onDisconnected?.();
        };

        // Start ping interval for keep-alive
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
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
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all peer connections
    this.peerConnections.forEach((pc, peerId) => {
      pc.close();
    });
    this.peerConnections.clear();
    this.dataChannels.clear();

    // Leave room and close WebSocket
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'leave' }));
      this.ws.close();
    }
    this.ws = null;

    this.roomId = null;
    this.peerId = null;
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
        // Keep-alive response, ignore
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

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(peerId, pc);
    this.pendingIceCandidates.set(peerId, []);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          targetPeerId: peerId,
          candidate: event.candidate,
          roomId: this.roomId,
          fromPeerId: this.peerId
        }));
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.cleanupPeer(peerId);
      }
    };

    // Handle data channel events
    pc.ondatachannel = (event) => {
      console.log('Received data channel from', peerId);
      this.setupDataChannel(event.channel, peerId);
    };

    // If we're the initiator, create data channel and offer
    if (isInitiator) {
      const dc = pc.createDataChannel('fileTransfer', {
        ordered: true
      });
      this.setupDataChannel(dc, peerId);

      // Create and send offer
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          this.ws.send(JSON.stringify({
            type: 'offer',
            targetPeerId: peerId,
            sdp: pc.localDescription,
            roomId: this.roomId,
            fromPeerId: this.peerId,
            fromDeviceName: this.deviceName
          }));
        })
        .catch(error => {
          console.error('Error creating offer:', error);
          this.onError?.('Failed to create connection offer');
        });
    }

    return pc;
  }

  /**
   * Setup data channel event handlers
   */
  setupDataChannel(dc, peerId) {
    dc.binaryType = 'arraybuffer';
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      console.log('Data channel opened with', peerId);
    };

    dc.onclose = () => {
      console.log('Data channel closed with', peerId);
      this.dataChannels.delete(peerId);
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
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Process any pending ICE candidates
      const pendingCandidates = this.pendingIceCandidates.get(fromPeerId) || [];
      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
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
      const pending = this.pendingIceCandidates.get(fromPeerId) || [];
      pending.push(candidate);
      this.pendingIceCandidates.set(fromPeerId, pending);
      return;
    }

    if (!pc.remoteDescription) {
      // Store candidate for later if remote description not set
      const pending = this.pendingIceCandidates.get(fromPeerId) || [];
      pending.push(candidate);
      this.pendingIceCandidates.set(fromPeerId, pending);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
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
