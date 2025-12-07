import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import webrtcService from '../services/webrtc';
import { generateRoomId, checkHealth } from '../api/signaling';

const BrowserTransfer = () => {
  // Connection state
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [deviceName, setDeviceName] = useState(() => {
    return localStorage.getItem('crossdrop_device_name') || `Browser-${Math.random().toString(36).substr(2, 4)}`;
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected'); // disconnected, connecting, connected, reconnecting, unstable
  const [peerId, setPeerId] = useState(null);
  const [peers, setPeers] = useState([]);
  const [signalingAvailable, setSignalingAvailable] = useState(null);

  // File transfer state
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [transferProgress, setTransferProgress] = useState(null);
  const [pendingFileRequest, setPendingFileRequest] = useState(null);
  const [transferHistory, setTransferHistory] = useState([]);

  // Reconnection state
  const [reconnectInfo, setReconnectInfo] = useState(null);

  const fileInputRef = useRef(null);

  // Check if signaling server is available
  useEffect(() => {
    const checkSignaling = async () => {
      try {
        await checkHealth();
        setSignalingAvailable(true);
      } catch (error) {
        console.error('Signaling server not available:', error);
        setSignalingAvailable(false);
      }
    };
    checkSignaling();

    // Re-check periodically
    const interval = setInterval(checkSignaling, 30000);
    return () => clearInterval(interval);
  }, []);

  // Setup WebRTC event handlers
  useEffect(() => {
    webrtcService.onConnected = (data) => {
      console.log('Connected to room:', data);
      setIsConnected(true);
      setIsConnecting(false);
      setIsReconnecting(false);
      setConnectionState('connected');
      setReconnectInfo(null);
      setPeerId(data.peerId);
      setRoomId(data.roomId);
      setPeers(data.peers || []);
      toast.success(`Connected to room ${data.roomId}`);
    };

    webrtcService.onDisconnected = () => {
      setIsConnected(false);
      setIsReconnecting(false);
      setConnectionState('disconnected');
      setReconnectInfo(null);
      setPeerId(null);
      setPeers([]);
      setSelectedPeer(null);
      toast('Disconnected from room');
    };

    webrtcService.onReconnecting = (info) => {
      console.log('Reconnecting:', info);
      setIsReconnecting(true);
      setConnectionState('reconnecting');
      setReconnectInfo(info);
      toast(`Reconnecting... (attempt ${info.attempt}/${info.maxAttempts})`);
    };

    webrtcService.onReconnected = () => {
      console.log('Reconnected successfully');
      setIsReconnecting(false);
      setConnectionState('connected');
      setReconnectInfo(null);
      toast.success('Reconnected successfully!');
    };

    webrtcService.onConnectionStateChange = (state) => {
      console.log('Connection state changed:', state);
      setConnectionState(state);

      if (state === 'unstable') {
        toast('Connection unstable, attempting to recover...', { icon: '⚠️' });
      } else if (state === 'offline') {
        toast('You are offline. Will reconnect when back online.', { icon: '📡' });
      }
    };

    webrtcService.onPeerJoined = (data) => {
      console.log('Peer joined event received:', data);
      console.log('New peers list:', data.peers);
      const newPeers = data.peers || [];
      setPeers(newPeers);
      console.log('setPeers called with:', newPeers);
      toast.success(`${data.deviceName} joined the room`);
    };

    webrtcService.onPeerLeft = (data) => {
      console.log('Peer left:', data);
      setPeers(data.peers || []);
      if (selectedPeer?.peerId === data.peerId) {
        setSelectedPeer(null);
      }
      toast(`A peer left the room`);
    };

    webrtcService.onPeerConnectionReady = (data) => {
      console.log('Peer connection ready:', data);
      // Force re-render to update the connection status indicator
      setPeers(prevPeers => [...prevPeers]);
      if (data.ready) {
        toast.success('Peer connection established!');
      }
    };

    webrtcService.onError = (error) => {
      console.error('WebRTC error:', error);
      toast.error(error || 'Connection error');
      setIsConnecting(false);
    };

    webrtcService.onFileRequest = (data) => {
      console.log('File request received:', data);
      setPendingFileRequest(data);
    };

    webrtcService.onFileAccepted = (data) => {
      console.log('File accepted, starting transfer');
      toast.success('File transfer accepted, sending...');
      webrtcService.startFileSend(data.fromPeerId);
    };

    webrtcService.onFileRejected = (data) => {
      console.log('File rejected:', data);
      toast.error(`File transfer rejected: ${data.reason || 'Unknown reason'}`);
      setTransferProgress(null);
    };

    webrtcService.onFileProgress = (data) => {
      setTransferProgress({
        ...data,
        speed: calculateSpeed(data)
      });
    };

    webrtcService.onFileComplete = (data) => {
      console.log('File transfer complete:', data);
      toast.success(
        `File ${data.direction === 'send' ? 'sent' : 'received'}: ${data.fileInfo.name}`
      );
      setTransferProgress(null);
      setSelectedFile(null);

      // Add to history
      setTransferHistory(prev => [{
        filename: data.fileInfo.name,
        size: data.fileInfo.size,
        direction: data.direction,
        peerId: data.targetPeerId || data.fromPeerId,
        timestamp: new Date().toISOString(),
        status: 'success'
      }, ...prev].slice(0, 20));
    };

    webrtcService.onFileError = (data) => {
      console.error('File transfer error:', data);
      toast.error(`Transfer failed: ${data.error}`);
      setTransferProgress(null);
    };

    return () => {
      // Clean up
      webrtcService.onConnected = null;
      webrtcService.onDisconnected = null;
      webrtcService.onReconnecting = null;
      webrtcService.onReconnected = null;
      webrtcService.onConnectionStateChange = null;
      webrtcService.onPeerJoined = null;
      webrtcService.onPeerLeft = null;
      webrtcService.onPeerConnectionReady = null;
      webrtcService.onError = null;
      webrtcService.onFileRequest = null;
      webrtcService.onFileAccepted = null;
      webrtcService.onFileRejected = null;
      webrtcService.onFileProgress = null;
      webrtcService.onFileComplete = null;
      webrtcService.onFileError = null;
    };
  }, [selectedPeer]);

  // Speed calculation helper
  const lastProgressRef = useRef({ bytes: 0, time: Date.now() });
  const calculateSpeed = (data) => {
    const now = Date.now();
    const bytes = data.bytesSent || data.bytesReceived || 0;
    const timeDiff = (now - lastProgressRef.current.time) / 1000;
    const bytesDiff = bytes - lastProgressRef.current.bytes;

    let speed = 0;
    if (timeDiff > 0) {
      speed = (bytesDiff / timeDiff) / (1024 * 1024); // MB/s
    }

    lastProgressRef.current = { bytes, time: now };
    return Math.max(0, speed);
  };

  // Save device name to localStorage
  useEffect(() => {
    localStorage.setItem('crossdrop_device_name', deviceName);
  }, [deviceName]);

  // Poll for connection status updates while peers are connecting
  useEffect(() => {
    if (!isConnected || peers.length === 0) return;

    // Check if any peers are still connecting
    const hasConnectingPeers = peers.some(peer => !webrtcService.isConnectedTo(peer.peerId));

    if (!hasConnectingPeers) return;

    // Poll every 500ms to update UI while connections are establishing
    const pollInterval = setInterval(() => {
      // Force re-render to update connection statuses
      setPeers(prevPeers => [...prevPeers]);

      // Check if all peers are now connected
      const stillConnecting = peers.some(peer => !webrtcService.isConnectedTo(peer.peerId));
      if (!stillConnecting) {
        clearInterval(pollInterval);
      }
    }, 500);

    return () => clearInterval(pollInterval);
  }, [isConnected, peers]);

  // Create a new room
  const handleCreateRoom = async () => {
    const newRoomId = generateRoomId();
    setIsConnecting(true);

    try {
      await webrtcService.connect(newRoomId, deviceName);
    } catch (error) {
      console.error('Failed to create room:', error);
      setIsConnecting(false);
    }
  };

  // Join an existing room
  const handleJoinRoom = async () => {
    if (!inputRoomId.trim()) {
      toast.error('Please enter a room ID');
      return;
    }

    setIsConnecting(true);

    try {
      await webrtcService.connect(inputRoomId.toUpperCase(), deviceName);
    } catch (error) {
      console.error('Failed to join room:', error);
      setIsConnecting(false);
    }
  };

  // Leave the room
  const handleLeaveRoom = () => {
    webrtcService.disconnect();
    setRoomId('');
    setIsConnected(false);
    setPeerId(null);
    setPeers([]);
    setSelectedPeer(null);
    setSelectedFile(null);
    setTransferProgress(null);
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      toast.success(`Selected: ${file.name}`);
    }
  };

  // Send file to selected peer
  const handleSendFile = () => {
    if (!selectedFile || !selectedPeer) {
      toast.error('Select a file and a peer first');
      return;
    }

    if (!webrtcService.isConnectedTo(selectedPeer.peerId)) {
      toast.error('Not connected to this peer yet. Please wait...');
      return;
    }

    webrtcService.requestFileSend(selectedPeer.peerId, selectedFile);
    toast('Requesting file transfer...');
  };

  // Accept incoming file
  const handleAcceptFile = () => {
    if (!pendingFileRequest) return;
    webrtcService.acceptFileTransfer(pendingFileRequest.fromPeerId, pendingFileRequest.fileInfo);
    setPendingFileRequest(null);
  };

  // Reject incoming file
  const handleRejectFile = () => {
    if (!pendingFileRequest) return;
    webrtcService.rejectFileTransfer(pendingFileRequest.fromPeerId, 'User declined');
    setPendingFileRequest(null);
  };

  // Copy room ID to clipboard
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room ID copied to clipboard!');
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="container-default py-8 lg:py-12">
        {/* Header */}
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="badge badge-primary mb-4 inline-flex">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            WebRTC Powered
          </span>
          <h1 className="heading-lg mb-3">Browser Transfer</h1>
          <p className="text-body-lg max-w-xl mx-auto">
            Share files directly between browsers anywhere in the world. No installation required.
          </p>
        </motion.div>

        {/* Signaling Server Status */}
        <AnimatePresence>
          {signalingAvailable === false && (
            <motion.div
              className="card mb-6 border-[var(--color-error)] bg-[var(--color-error-light)]"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-error)]/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[var(--color-error)]">Signaling server unavailable</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Make sure the signaling server is running on port 3001
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          {/* Not Connected - Show Join/Create */}
          {!isConnected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Device Name Card */}
              <div className="card mb-6">
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Your Device Name
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="input"
                  placeholder="My Device"
                />
                <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                  This name will be visible to other peers in the room
                </p>
              </div>

              {/* Create/Join Cards */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Create Room */}
                <div className="card card-hover">
                  <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                    Create New Room
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                    Create a room and share the code with others to connect.
                  </p>
                  <button
                    onClick={handleCreateRoom}
                    disabled={isConnecting || signalingAvailable === false}
                    className="btn btn-primary w-full"
                  >
                    {isConnecting ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creating...
                      </>
                    ) : (
                      'Create Room'
                    )}
                  </button>
                </div>

                {/* Join Room */}
                <div className="card card-hover">
                  <div className="w-12 h-12 rounded-xl bg-[var(--color-success)]/10 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                    Join Existing Room
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                    Enter a room code to join.
                  </p>
                  <input
                    type="text"
                    value={inputRoomId}
                    onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                    className="input mb-3 text-center font-mono text-lg tracking-widest uppercase"
                    placeholder="ROOM ID"
                    maxLength={6}
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={isConnecting || !inputRoomId.trim() || signalingAvailable === false}
                    className="btn btn-secondary w-full border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success)]/10"
                  >
                    {isConnecting ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Joining...
                      </>
                    ) : (
                      'Join Room'
                    )}
                  </button>
                </div>
              </div>

              {/* How it works */}
              <div className="card mt-8 bg-[var(--color-bg-secondary)]">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                  How Browser Transfer Works
                </h3>
                <div className="grid sm:grid-cols-4 gap-4">
                  {[
                    { step: '1', title: 'Create or Join', desc: 'Start a new room or join with a code' },
                    { step: '2', title: 'Connect', desc: 'WebRTC establishes direct connection' },
                    { step: '3', title: 'Transfer', desc: 'Files sent peer-to-peer directly' },
                    { step: '4', title: 'Secure', desc: 'End-to-end encrypted by WebRTC' },
                  ].map((item) => (
                    <div key={item.step} className="text-center">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] text-white font-semibold flex items-center justify-center mx-auto mb-2">
                        {item.step}
                      </div>
                      <h4 className="font-medium text-[var(--color-text-primary)] text-sm">{item.title}</h4>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Connected - Show Room Info */}
          {isConnected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Room Info Card */}
              <div className="card mb-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-[var(--color-text-tertiary)]">Room ID</p>
                      {/* Connection Status Indicator */}
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        connectionState === 'connected'
                          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                          : connectionState === 'reconnecting'
                          ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                          : connectionState === 'unstable'
                          ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                          : 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          connectionState === 'connected'
                            ? 'bg-[var(--color-success)] animate-pulse'
                            : connectionState === 'reconnecting'
                            ? 'bg-[var(--color-warning)] animate-pulse'
                            : connectionState === 'unstable'
                            ? 'bg-[var(--color-warning)]'
                            : 'bg-[var(--color-error)]'
                        }`} />
                        {connectionState === 'connected' && 'Connected'}
                        {connectionState === 'reconnecting' && `Reconnecting${reconnectInfo ? ` (${reconnectInfo.attempt}/${reconnectInfo.maxAttempts})` : '...'}`}
                        {connectionState === 'unstable' && 'Unstable'}
                        {connectionState === 'offline' && 'Offline'}
                        {connectionState === 'disconnected' && 'Disconnected'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-bold font-mono text-[var(--color-primary)] tracking-widest">
                        {roomId}
                      </span>
                      <button
                        onClick={copyRoomId}
                        className="btn btn-ghost btn-icon"
                        title="Copy room ID"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      Share this code with others to connect
                    </p>
                  </div>
                  <button
                    onClick={handleLeaveRoom}
                    className="btn btn-secondary border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Leave Room
                  </button>
                </div>
              </div>

              {/* Two Column Layout */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Peers List */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                      Connected Peers
                    </h2>
                    <span className="badge badge-neutral">
                      {peers.length} {peers.length === 1 ? 'peer' : 'peers'}
                    </span>
                  </div>

                  {peers.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <p className="text-[var(--color-text-secondary)] font-medium mb-1">
                        Waiting for others to join
                      </p>
                      <p className="text-sm text-[var(--color-text-tertiary)]">
                        Share the room code above
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {peers.map((peer) => {
                        const isSelected = selectedPeer?.peerId === peer.peerId;
                        const isConnectedToPeer = webrtcService.isConnectedTo(peer.peerId);
                        const connectionStatus = webrtcService.getPeerConnectionStatus(peer.peerId);

                        // Determine status text and color
                        let statusText = 'Establishing connection...';
                        let statusColor = 'bg-[var(--color-warning)]';

                        if (isConnectedToPeer) {
                          statusText = 'Ready to transfer';
                          statusColor = 'bg-[var(--color-success)]';
                        } else if (connectionStatus.iceConnectionState === 'checking') {
                          statusText = 'Connecting...';
                        } else if (connectionStatus.iceConnectionState === 'failed') {
                          statusText = 'Connection failed';
                          statusColor = 'bg-[var(--color-error)]';
                        } else if (connectionStatus.iceConnectionState === 'disconnected') {
                          statusText = 'Reconnecting...';
                        }

                        return (
                          <div
                            key={peer.peerId}
                            onClick={() => setSelectedPeer(isSelected ? null : peer)}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              isSelected
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <div className="w-10 h-10 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center">
                                    <svg className="w-5 h-5 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--color-surface)] ${statusColor} ${
                                    !isConnectedToPeer && connectionStatus.iceConnectionState !== 'failed' ? 'animate-pulse' : ''
                                  }`} />
                                </div>
                                <div>
                                  <h3 className="font-medium text-[var(--color-text-primary)]">
                                    {peer.deviceName}
                                  </h3>
                                  <p className="text-xs text-[var(--color-text-tertiary)]">
                                    {statusText}
                                  </p>
                                </div>
                              </div>
                              {isSelected && (
                                <span className="badge badge-primary">Selected</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* File Transfer Section */}
                <div className="card">
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                    Send File
                  </h2>

                  {/* File Input */}
                  <div className="mb-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-6 border-2 border-dashed border-[var(--color-border)] rounded-xl hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all"
                    >
                      {selectedFile ? (
                        <div className="text-center">
                          <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center mx-auto mb-3">
                            <svg className="w-6 h-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <p className="font-medium text-[var(--color-text-primary)]">{selectedFile.name}</p>
                          <p className="text-sm text-[var(--color-text-secondary)]">{formatFileSize(selectedFile.size)}</p>
                          <p className="text-xs text-[var(--color-primary)] mt-2">Click to change</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center mx-auto mb-3">
                            <svg className="w-6 h-6 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                          </div>
                          <p className="text-[var(--color-text-secondary)]">Click to select a file</p>
                          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">or drag and drop</p>
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Selected Peer Info */}
                  {selectedPeer && (
                    <div className="mb-4 p-3 bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-lg">
                      <p className="text-sm text-[var(--color-primary)]">
                        <span className="font-medium">Sending to:</span> {selectedPeer.deviceName}
                      </p>
                    </div>
                  )}

                  {/* Send Button */}
                  <button
                    onClick={handleSendFile}
                    disabled={!selectedFile || !selectedPeer || peers.length === 0}
                    className="btn btn-primary w-full"
                  >
                    {!selectedFile ? 'Select a File' : !selectedPeer ? 'Select a Peer' : 'Send File'}
                  </button>

                  {/* Transfer Progress */}
                  <AnimatePresence>
                    {transferProgress && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4 p-4 bg-[var(--color-bg-secondary)] rounded-xl"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {transferProgress.direction === 'send' ? (
                              <svg className="w-4 h-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            )}
                            <span className="text-sm font-medium text-[var(--color-text-primary)]">
                              {transferProgress.direction === 'send' ? 'Sending' : 'Receiving'}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-[var(--color-primary)]">
                            {transferProgress.progress?.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] mb-2 truncate">
                          {transferProgress.fileInfo?.name}
                        </p>
                        <div className="progress-bar mb-2">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${transferProgress.progress || 0}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-[var(--color-text-tertiary)]">
                          <span>
                            {formatFileSize(transferProgress.bytesSent || transferProgress.bytesReceived || 0)} / {formatFileSize(transferProgress.totalBytes)}
                          </span>
                          <span>
                            {transferProgress.speed?.toFixed(2) || 0} MB/s
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Transfer History */}
              {transferHistory.length > 0 && (
                <motion.div
                  className="card mt-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                      Transfer History
                    </h2>
                    <span className="badge badge-neutral">{transferHistory.length}</span>
                  </div>
                  <div className="space-y-2">
                    {transferHistory.map((transfer, index) => (
                      <div
                        key={index}
                        className="p-3 bg-[var(--color-bg-secondary)] rounded-lg flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            transfer.direction === 'send'
                              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                              : 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                          }`}>
                            {transfer.direction === 'send' ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-[var(--color-text-primary)]">{transfer.filename}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)]">
                              {transfer.direction === 'send' ? 'Sent' : 'Received'} - {formatFileSize(transfer.size)}
                            </p>
                          </div>
                        </div>
                        <span className="badge badge-success">
                          Success
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>

        {/* Incoming File Request Modal */}
        <AnimatePresence>
          {pendingFileRequest && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <motion.div
                className="card max-w-md w-full"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-info)]/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-[var(--color-info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">Incoming File</h3>
                </div>
                <div className="mb-6">
                  <p className="text-[var(--color-text-secondary)] mb-3">
                    <span className="font-medium text-[var(--color-text-primary)]">{pendingFileRequest.fromDeviceName}</span> wants to send you a file:
                  </p>
                  <div className="p-4 bg-[var(--color-bg-secondary)] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[var(--color-text-primary)] truncate">{pendingFileRequest.fileInfo.name}</p>
                        <p className="text-sm text-[var(--color-text-tertiary)]">{formatFileSize(pendingFileRequest.fileInfo.size)}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleRejectFile}
                    className="btn btn-secondary flex-1"
                  >
                    Decline
                  </button>
                  <button
                    onClick={handleAcceptFile}
                    className="btn btn-primary flex-1"
                  >
                    Accept
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BrowserTransfer;
